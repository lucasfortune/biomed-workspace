/**
 * SliceInterpolator - Shape-based interpolation of one class between annotated slices
 *
 * The user annotates a class on some slices ("keyframes") and this module fills the
 * slices in between. Per gap it blends the signed distance fields of the two
 * keyframe masks linearly in z and thresholds the blend at zero (Raya & Udupa 1990,
 * the method ITK-SNAP uses). Before blending, the two masks are aligned by their
 * centroids so a structure that drifts sideways through the stack stays connected
 * instead of thinning out in the middle of the gap.
 *
 * Everything here is pure: label arrays in, binary masks out. The annotation module
 * decides how the masks are written back (only background pixels are filled, see
 * AnnotationModule.runInterpolation) and owns undo/redo and the UI.
 *
 * Limitations (by design, an MVP): a structure that splits, merges, appears or ends
 * between two keyframes is morphed smoothly rather than topologically. The fix is
 * an extra keyframe closer to the event.
 *
 * @module SliceInterpolator
 */

// Larger than any squared pixel distance in an image (used as "no feature" in the EDT)
const INF = 1e20;

// =============================================================================
// MASK HELPERS
// =============================================================================

/**
 * Extract a binary mask (0/1) of one class from a label array
 * @param {Uint8Array} data - Label array (0 = background, 1..N = class IDs)
 * @param {number} classId
 * @returns {Uint8Array} mask of the same length
 */
export function extractMask(data, classId) {
  const mask = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    if (data[i] === classId) mask[i] = 1;
  }
  return mask;
}

/**
 * Number of set pixels and their centroid
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @returns {{count:number, x:number, y:number}} centroid (NaN coordinates when count = 0)
 */
export function centroid(mask, width, height) {
  let count = 0, sx = 0, sy = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x]) { count++; sx += x; sy += y; }
    }
  }
  return { count, x: count ? sx / count : NaN, y: count ? sy / count : NaN };
}

// =============================================================================
// EUCLIDEAN DISTANCE TRANSFORM (Felzenszwalb & Huttenlocher 2012)
// =============================================================================

/**
 * 1D squared distance transform of a sampled function (lower envelope of parabolas).
 * Scratch arrays are passed in so the 2D pass allocates nothing per row/column.
 * @param {Float64Array} f - input values (0 at features, INF elsewhere), length n
 * @param {number} n
 * @param {Float64Array} d - output squared distances, length n
 * @param {Int32Array} v - scratch (parabola vertices), length n
 * @param {Float64Array} z - scratch (parabola boundaries), length n + 1
 */
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/**
 * Squared Euclidean distance of every pixel to the nearest set pixel of the mask.
 * Pixels of an all-zero mask get INF.
 * @param {Uint8Array} mask - 0/1, width * height
 * @param {number} width
 * @param {number} height
 * @returns {Float64Array} squared distances, width * height
 */
export function squaredDistanceToMask(mask, width, height) {
  const out = new Float64Array(width * height);
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  // Columns first
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = mask[y * width + x] ? 0 : INF;
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) out[y * width + x] = d[y];
  }
  // Then rows on the column result
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = out[row + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) out[row + x] = d[x];
  }
  return out;
}

/**
 * Signed distance field of a binary mask: positive inside (distance to the nearest
 * background pixel), negative outside (minus the distance to the nearest mask pixel).
 * Values are clamped to ±(width + height) so a mask covering the whole image or an
 * empty mask still yields finite numbers.
 * @param {Uint8Array} mask - 0/1, width * height
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array} signed distances, width * height
 */
export function signedDistance(mask, width, height) {
  const size = width * height;
  const inverse = new Uint8Array(size);
  for (let i = 0; i < size; i++) inverse[i] = mask[i] ? 0 : 1;

  const distOut = squaredDistanceToMask(mask, width, height);     // for outside pixels
  const distIn = squaredDistanceToMask(inverse, width, height);   // for inside pixels
  const limit = width + height;

  const sdf = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const sq = mask[i] ? distIn[i] : distOut[i];
    const dist = Math.min(limit, Math.sqrt(sq));
    sdf[i] = mask[i] ? dist : -dist;
  }
  return sdf;
}

// =============================================================================
// INTERPOLATION
// =============================================================================

/**
 * Interpolate `count` masks between two keyframe masks.
 *
 * Both signed distance fields can be passed in (`sdfA`, `sdfB`) so a keyframe shared
 * by two gaps is transformed once; otherwise they are computed here.
 *
 * @param {Uint8Array} maskA - keyframe mask on the lower slice (0/1)
 * @param {Uint8Array} maskB - keyframe mask on the upper slice (0/1)
 * @param {number} width
 * @param {number} height
 * @param {number} count - number of intermediate slices to produce
 * @param {object} [options]
 * @param {boolean} [options.align=true] - align the two masks by centroid before blending
 * @param {Float32Array} [options.sdfA] - precomputed signedDistance(maskA)
 * @param {Float32Array} [options.sdfB] - precomputed signedDistance(maskB)
 * @returns {Uint8Array[]} `count` masks (0/1), in order from the lower to the upper slice
 */
export function interpolateMasks(maskA, maskB, width, height, count, options = {}) {
  const { align = true } = options;
  const results = [];
  if (count <= 0) return results;

  const cA = centroid(maskA, width, height);
  const cB = centroid(maskB, width, height);
  if (cA.count === 0 || cB.count === 0) {
    // Nothing to morph from or to: leave the gap empty
    for (let i = 0; i < count; i++) results.push(new Uint8Array(width * height));
    return results;
  }

  const sdfA = options.sdfA || signedDistance(maskA, width, height);
  const sdfB = options.sdfB || signedDistance(maskB, width, height);

  // Total centroid drift from A to B (zero when alignment is off)
  const driftX = align ? cB.x - cA.x : 0;
  const driftY = align ? cB.y - cA.y : 0;

  const outside = -(width + height);   // samples that fall off the image count as far outside
  const size = width * height;

  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1);
    const wA = 1 - t;
    const wB = t;

    // On slice t the blended shape should sit at cA + t * drift. Shift A forward by
    // t * drift and B backward by (1 - t) * drift so both land there (integer offsets:
    // nearest-neighbour sampling keeps the fields crisp and avoids resampling blur).
    const ax = Math.round(t * driftX), ay = Math.round(t * driftY);
    const bx = Math.round((t - 1) * driftX), by = Math.round((t - 1) * driftY);

    const mask = new Uint8Array(size);
    for (let y = 0; y < height; y++) {
      const yA = y - ay, yB = y - by;
      const rowA = (yA >= 0 && yA < height) ? yA * width : -1;
      const rowB = (yB >= 0 && yB < height) ? yB * width : -1;
      const row = y * width;
      for (let x = 0; x < width; x++) {
        const xA = x - ax, xB = x - bx;
        const sA = (rowA >= 0 && xA >= 0 && xA < width) ? sdfA[rowA + xA] : outside;
        const sB = (rowB >= 0 && xB >= 0 && xB < width) ? sdfB[rowB + xB] : outside;
        if (wA * sA + wB * sB > 0) mask[row + x] = 1;
      }
    }
    results.push(mask);
  }
  return results;
}

// =============================================================================
// KEYFRAMES AND GAP PLANNING
// =============================================================================

/**
 * Slices on which a class has at least one pixel, in ascending order
 * @param {Map<number, Uint8Array>} sliceAnnotations - slice index -> label array
 * @param {number} classId
 * @returns {number[]}
 */
export function findKeyframes(sliceAnnotations, classId) {
  const keyframes = [];
  for (const [sliceIndex, data] of sliceAnnotations) {
    if (!data) continue;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === classId) { keyframes.push(sliceIndex); break; }
    }
  }
  return keyframes.sort((a, b) => a - b);
}

/**
 * Split consecutive keyframe pairs into gaps to fill and gaps to skip.
 * A gap is the pair (from, to) of neighbouring keyframes; its distance is to - from
 * ("annotate every 10th slice" gives distance 10). Adjacent keyframes (distance 1)
 * have nothing between them and are not listed. Gaps wider than `maxGap` are skipped
 * so two unrelated occurrences of a class far apart in z are not bridged.
 *
 * @param {number[]} keyframes - ascending slice indices
 * @param {number} maxGap - largest distance that is still connected
 * @returns {{fill: Array<{from:number,to:number,count:number}>, skipped: Array<{from:number,to:number,count:number}>}}
 *   `count` is the number of intermediate slices in the gap
 */
export function planGaps(keyframes, maxGap) {
  const fill = [], skipped = [];
  for (let i = 0; i + 1 < keyframes.length; i++) {
    const from = keyframes[i], to = keyframes[i + 1];
    const distance = to - from;
    if (distance < 2) continue;
    const gap = { from, to, count: distance - 1 };
    if (distance <= maxGap) fill.push(gap); else skipped.push(gap);
  }
  return { fill, skipped };
}

/**
 * Interpolate one class across all fillable gaps of a stack.
 *
 * Yields one result per gap (`{ from, to, masks }`), computing each keyframe's
 * signed distance field only once, so callers can write slices and refresh the UI
 * between gaps. Nothing is written to `sliceAnnotations`.
 *
 * @param {Map<number, Uint8Array>} sliceAnnotations - slice index -> label array
 * @param {number} classId
 * @param {number} width
 * @param {number} height
 * @param {Array<{from:number,to:number,count:number}>} gaps - from planGaps().fill
 * @param {object} [options] - see interpolateMasks (align)
 * @returns {Generator<{from:number, to:number, masks:Uint8Array[]}>}
 */
export function* interpolateClass(sliceAnnotations, classId, width, height, gaps, options = {}) {
  let cachedIndex = -1, cachedMask = null, cachedSdf = null;
  const keyframe = (index) => {
    if (index !== cachedIndex) {
      cachedIndex = index;
      cachedMask = extractMask(sliceAnnotations.get(index), classId);
      cachedSdf = signedDistance(cachedMask, width, height);
    }
    return { mask: cachedMask, sdf: cachedSdf };
  };

  for (const gap of gaps) {
    const a = keyframe(gap.from);
    // Keep A's arrays: keyframe() would overwrite the cache while computing B
    const maskA = a.mask, sdfA = a.sdf;
    const b = keyframe(gap.to);
    const masks = interpolateMasks(maskA, b.mask, width, height, gap.count,
      { ...options, sdfA, sdfB: b.sdf });
    yield { from: gap.from, to: gap.to, masks };
  }
}

export default {
  extractMask,
  centroid,
  squaredDistanceToMask,
  signedDistance,
  interpolateMasks,
  findKeyframes,
  planGaps,
  interpolateClass
};
