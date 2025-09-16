// dataLoader.js - Data loading and processing utilities
// This file contains utilities for loading and processing different types of data
// Note: The main loadSegmentationData function is in meshCreation.js since it's specific to mesh creation

/**
 * Validate segmentation data structure
 * @param {Object} data - The data to validate
 * @returns {Object} - Validation result with isValid and errors array
 */
export function validateSegmentationData(data) {
    const errors = [];
    
    if (!data) {
        errors.push('Data is null or undefined');
        return { isValid: false, errors };
    }
    
    // Check required properties
    if (!data.shape || !Array.isArray(data.shape) || data.shape.length !== 3) {
        errors.push('Invalid or missing shape property - must be [depth, height, width]');
    }
    
    if (!data.data || !Array.isArray(data.data)) {
        errors.push('Invalid or missing data array');
    }
    
    // Validate data structure
    if (data.data && data.data.length > 0) {
        const firstVoxel = data.data[0];
        if (!firstVoxel.hasOwnProperty('x') || !firstVoxel.hasOwnProperty('y') || 
            !firstVoxel.hasOwnProperty('z') || !firstVoxel.hasOwnProperty('value')) {
            errors.push('Invalid voxel data structure - must have x, y, z, value properties');
        }
    }
    
    // Check for reasonable data size
    if (data.data && data.data.length > 1000000) {
        console.warn('Large dataset detected:', data.data.length, 'voxels');
    }
    
    const isValid = errors.length === 0;
    
    if (isValid) {
        console.log('Segmentation data validation passed');
    } else {
        console.error('Segmentation data validation failed:', errors);
    }
    
    return { isValid, errors };
}

/**
 * Extract statistics from segmentation data
 * @param {Object} data - The segmentation data
 * @returns {Object} - Statistics about the data
 */
export function extractDataStatistics(data) {
    if (!data || !data.data) {
        return null;
    }
    
    const voxels = data.data;
    const classes = new Set();
    const classCounts = {};
    
    // Count voxels per class
    voxels.forEach(voxel => {
        classes.add(voxel.value);
        classCounts[voxel.value] = (classCounts[voxel.value] || 0) + 1;
    });
    
    // Calculate total volume if shape is available
    let totalVolume = 0;
    let density = 0;
    
    if (data.shape && Array.isArray(data.shape) && data.shape.length === 3) {
        totalVolume = data.shape[0] * data.shape[1] * data.shape[2];
        density = voxels.length / totalVolume;
    }
    
    const stats = {
        totalVoxels: voxels.length,
        totalVolume,
        density,
        classCount: classes.size,
        classes: Array.from(classes).sort(),
        classCounts,
        dataSize: JSON.stringify(data).length // Rough estimate of memory usage
    };
    
    console.log('Data statistics:', stats);
    return stats;
}

/**
 * Preprocess segmentation data for better performance
 * @param {Object} data - The raw segmentation data
 * @returns {Object} - Preprocessed data
 */
export function preprocessSegmentationData(data) {
    console.log('Preprocessing segmentation data...');
    
    // Validate input
    const validation = validateSegmentationData(data);
    if (!validation.isValid) {
        throw new Error('Invalid segmentation data: ' + validation.errors.join(', '));
    }
    
    // Extract statistics
    const statistics = extractDataStatistics(data);
    
    // Sort voxels by class for better performance during mesh creation
    const sortedVoxels = [...data.data].sort((a, b) => {
        if (a.value !== b.value) return a.value - b.value;
        if (a.z !== b.z) return a.z - b.z;
        if (a.y !== b.y) return a.y - b.y;
        return a.x - b.x;
    });
    
    const preprocessedData = {
        ...data,
        data: sortedVoxels,
        statistics,
        preprocessed: true,
        preprocessedAt: new Date().toISOString()
    };
    
    console.log('Segmentation data preprocessing complete');
    return preprocessedData;
}

/**
 * Load data with progress callback
 * @param {string} url - URL to load data from
 * @param {Function} progressCallback - Optional progress callback function
 * @returns {Promise<Object>} - Promise resolving to the loaded data
 */
export async function loadDataWithProgress(url, progressCallback = null) {
    console.log('Loading data with progress tracking from:', url);
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
        }
        
        const contentLength = response.headers.get('Content-Length');
        let totalBytes = 0;
        let loadedBytes = 0;
        
        if (contentLength) {
            totalBytes = parseInt(contentLength, 10);
        }
        
        // If we can track progress
        if (totalBytes > 0 && progressCallback && response.body) {
            const reader = response.body.getReader();
            const chunks = [];
            
            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                chunks.push(value);
                loadedBytes += value.length;
                
                const progress = (loadedBytes / totalBytes) * 100;
                progressCallback(progress, loadedBytes, totalBytes);
            }
            
            // Reconstruct the response
            const allChunks = new Uint8Array(loadedBytes);
            let position = 0;
            for (const chunk of chunks) {
                allChunks.set(chunk, position);
                position += chunk.length;
            }
            
            const textDecoder = new TextDecoder();
            const jsonString = textDecoder.decode(allChunks);
            const data = JSON.parse(jsonString);
            
            return data;
        } else {
            // Fall back to regular loading if progress tracking isn't available
            const data = await response.json();
            if (progressCallback) {
                progressCallback(100, -1, -1);
            }
            return data;
        }
        
    } catch (error) {
        console.error('Failed to load data with progress:', error);
        throw error;
    }
}

/**
 * Cache management for loaded data
 */
class DataCache {
    constructor(maxSize = 100 * 1024 * 1024) { // 100MB default
        this.cache = new Map();
        this.maxSize = maxSize;
        this.currentSize = 0;
    }
    
    set(key, data) {
        const dataSize = this.estimateSize(data);
        
        // Remove old entries if needed
        while (this.currentSize + dataSize > this.maxSize && this.cache.size > 0) {
            const firstKey = this.cache.keys().next().value;
            this.delete(firstKey);
        }
        
        this.cache.set(key, {
            data,
            size: dataSize,
            timestamp: Date.now()
        });
        this.currentSize += dataSize;
        
        console.log(`Cached data for key: ${key} (${dataSize} bytes, total: ${this.currentSize} bytes)`);
    }
    
    get(key) {
        const entry = this.cache.get(key);
        if (entry) {
            console.log(`Retrieved cached data for key: ${key}`);
            return entry.data;
        }
        return null;
    }
    
    delete(key) {
        const entry = this.cache.get(key);
        if (entry) {
            this.cache.delete(key);
            this.currentSize -= entry.size;
            console.log(`Deleted cached data for key: ${key}`);
        }
    }
    
    clear() {
        this.cache.clear();
        this.currentSize = 0;
        console.log('Cleared data cache');
    }
    
    estimateSize(data) {
        // Rough estimate of data size in bytes
        return JSON.stringify(data).length * 2; // Multiply by 2 for Unicode overhead
    }
}

// Create global data cache instance
const dataCache = new DataCache();

/**
 * Load data with caching support
 * @param {string} url - URL to load data from
 * @param {boolean} useCache - Whether to use caching (default: true)
 * @returns {Promise<Object>} - Promise resolving to the loaded data
 */
export async function loadDataWithCache(url, useCache = true) {
    if (useCache) {
        const cachedData = dataCache.get(url);
        if (cachedData) {
            console.log('Using cached data for:', url);
            return cachedData;
        }
    }
    
    console.log('Loading fresh data from:', url);
    const response = await fetch(url);
    
    if (!response.ok) {
        throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (useCache) {
        dataCache.set(url, data);
    }
    
    return data;
}

/**
 * Export cache management functions
 */
export const cacheManager = {
    clear: () => dataCache.clear(),
    delete: (key) => dataCache.delete(key),
    size: () => dataCache.currentSize,
    keys: () => Array.from(dataCache.cache.keys())
};