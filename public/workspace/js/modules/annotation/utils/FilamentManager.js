/**
 * FilamentManager - Pure data manager for filament centerpoints
 *
 * Manages filament definitions and per-slice point placement.
 * No DOM dependencies - rendering handled by CenterpointEngine.
 *
 * @module FilamentManager
 */

class FilamentManager {

  constructor() {
    // Filament storage
    this.filaments = [];         // Array<Filament>
    this.nextFilamentId = 1;     // Auto-incrementing ID
    this.nextNameNumber = 1;     // Auto-incrementing name counter
    this.activeFilamentId = null;// Currently selected filament ID (null = none)

    // 10-color palette, visually distinct from BrushEngine class colors
    this.colorPalette = [
      '#00BFFF', // deep sky blue
      '#FF4500', // orange-red
      '#32CD32', // lime green
      '#FF69B4', // hot pink
      '#FFD700', // gold
      '#8A2BE2', // blue-violet
      '#00CED1', // dark turquoise
      '#FF6347', // tomato
      '#7FFF00', // chartreuse
      '#DA70D6'  // orchid
    ];

    // Callbacks
    this.onChange = null;     // () => void -- called on any data mutation
  }

  // ===========================================================================
  // FILAMENT CRUD
  // ===========================================================================

  /**
   * Add a new filament
   * @param {number} classId - The class ID to associate (from BrushEngine active class)
   * @returns {object} The created filament { id, name, color, classId, points: {} }
   */
  addFilament(classId) {
    const id = this.nextFilamentId++;
    const colorIndex = (this.filaments.length) % this.colorPalette.length;
    const filament = {
      id,
      name: `MT-${this.nextNameNumber++}`,
      color: this.colorPalette[colorIndex],
      classId: classId || 0,
      points: {}   // Map<sliceIndex (string), { x: number, y: number }>
    };
    this.filaments.push(filament);
    this.activeFilamentId = id;
    this._notify();
    return filament;
  }

  /**
   * Remove a filament by ID
   * @param {number} filamentId
   * @returns {boolean} true if removed
   */
  removeFilament(filamentId) {
    const index = this.filaments.findIndex(f => f.id === filamentId);
    if (index === -1) return false;
    this.filaments.splice(index, 1);
    if (this.activeFilamentId === filamentId) {
      this.activeFilamentId = this.filaments.length > 0
        ? this.filaments[0].id
        : null;
    }
    this._notify();
    return true;
  }

  /**
   * Rename a filament
   * @param {number} filamentId
   * @param {string} newName
   */
  renameFilament(filamentId, newName) {
    const fil = this.getFilament(filamentId);
    if (fil && newName && newName.trim()) {
      fil.name = newName.trim();
      this._notify();
    }
  }

  /**
   * Set the active filament
   * @param {number|null} filamentId
   */
  setActiveFilament(filamentId) {
    this.activeFilamentId = filamentId;
  }

  /**
   * Get filament by ID
   * @param {number} filamentId
   * @returns {object|null}
   */
  getFilament(filamentId) {
    return this.filaments.find(f => f.id === filamentId) || null;
  }

  /**
   * Get the active filament
   * @returns {object|null}
   */
  getActiveFilament() {
    return this.getFilament(this.activeFilamentId);
  }

  /**
   * Get all filaments
   * @returns {Array}
   */
  getAllFilaments() {
    return this.filaments;
  }

  /**
   * Check if any filament has points
   * @returns {boolean}
   */
  hasAnyPoints() {
    return this.filaments.some(f => Object.keys(f.points).length > 0);
  }

  // ===========================================================================
  // POINT MANAGEMENT
  // ===========================================================================

  /**
   * Set (place or reposition) a point for the active filament on a slice
   * @param {number} sliceIndex
   * @param {number} x - source pixel X
   * @param {number} y - source pixel Y
   * @returns {boolean} true if placed
   */
  setPoint(sliceIndex, x, y) {
    const fil = this.getActiveFilament();
    if (!fil) return false;
    fil.points[sliceIndex.toString()] = { x, y };
    this._notify();
    return true;
  }

  /**
   * Remove a point for a specific filament on a slice
   * @param {number} filamentId
   * @param {number} sliceIndex
   * @returns {boolean} true if removed
   */
  removePoint(filamentId, sliceIndex) {
    const fil = this.getFilament(filamentId);
    if (!fil) return false;
    const key = sliceIndex.toString();
    if (key in fil.points) {
      delete fil.points[key];
      this._notify();
      return true;
    }
    return false;
  }

  /**
   * Get a point for a filament on a slice
   * @param {number} filamentId
   * @param {number} sliceIndex
   * @returns {{ x: number, y: number }|null}
   */
  getPoint(filamentId, sliceIndex) {
    const fil = this.getFilament(filamentId);
    if (!fil) return null;
    return fil.points[sliceIndex.toString()] || null;
  }

  /**
   * Get all points on a given slice (all filaments)
   * @param {number} sliceIndex
   * @returns {Array<{ filamentId: number, x: number, y: number, color: string, isActive: boolean }>}
   */
  getPointsOnSlice(sliceIndex) {
    const key = sliceIndex.toString();
    const points = [];
    for (const fil of this.filaments) {
      const pt = fil.points[key];
      if (pt) {
        points.push({
          filamentId: fil.id,
          x: pt.x,
          y: pt.y,
          color: fil.color,
          name: fil.name,
          isActive: fil.id === this.activeFilamentId
        });
      }
    }
    return points;
  }

  /**
   * Get point count for a filament (across all slices)
   * @param {number} filamentId
   * @returns {number}
   */
  getPointCount(filamentId) {
    const fil = this.getFilament(filamentId);
    return fil ? Object.keys(fil.points).length : 0;
  }

  /**
   * Find which filament has a point near the given coordinates on a slice
   * Used for right-click deletion hit-testing
   * @param {number} sliceIndex
   * @param {number} x
   * @param {number} y
   * @param {number} radius - hit-test radius in source pixels
   * @returns {{ filamentId: number, distance: number }|null}
   */
  hitTest(sliceIndex, x, y, radius = 8) {
    const key = sliceIndex.toString();
    let closest = null;
    let closestDist = Infinity;

    for (const fil of this.filaments) {
      const pt = fil.points[key];
      if (!pt) continue;
      const dx = pt.x - x;
      const dy = pt.y - y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius && dist < closestDist) {
        closest = { filamentId: fil.id, distance: dist };
        closestDist = dist;
      }
    }
    return closest;
  }

  // ===========================================================================
  // SERIALIZATION
  // ===========================================================================

  /**
   * Serialize to JSON-safe object for saving
   * @param {string} sourceFileId
   * @returns {object}
   */
  toJSON(sourceFileId) {
    return {
      version: '1.0.0',
      sourceFileId: sourceFileId || 'unknown',
      filaments: this.filaments.map(f => ({
        id: f.id,
        name: f.name,
        color: f.color,
        classId: f.classId,
        points: { ...f.points }
      }))
    };
  }

  /**
   * Restore from saved JSON data
   * @param {object} data - The _filaments.json content
   */
  fromJSON(data) {
    if (!data || !data.filaments) return;

    this.filaments = data.filaments.map(f => ({
      id: f.id,
      name: f.name,
      color: f.color,
      classId: f.classId,
      points: f.points || {}
    }));

    // Update counters
    if (this.filaments.length > 0) {
      this.nextFilamentId = Math.max(...this.filaments.map(f => f.id)) + 1;
      // Parse name numbers for MT-N pattern
      const nameNumbers = this.filaments
        .map(f => {
          const match = f.name.match(/^MT-(\d+)$/);
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter(n => n > 0);
      this.nextNameNumber = nameNumbers.length > 0
        ? Math.max(...nameNumbers) + 1
        : this.filaments.length + 1;
      this.activeFilamentId = this.filaments[0].id;
    } else {
      this.nextFilamentId = 1;
      this.nextNameNumber = 1;
      this.activeFilamentId = null;
    }
  }

  // ===========================================================================
  // INTERNAL
  // ===========================================================================

  _notify() {
    if (this.onChange) {
      this.onChange();
    }
  }

  /**
   * Clean up
   */
  destroy() {
    this.filaments = [];
    this.onChange = null;
  }
}

export default FilamentManager;
