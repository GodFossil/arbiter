class CacheManager {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 1000; // Maximum number of cached items
    this.defaultTTL = 3600000; // 1 hour in milliseconds
    
    // Different TTL for different types of content
    this.ttlConfig = {
      'fact-check': 24 * 3600000, // 24 hours for fact-check results
      'search': 6 * 3600000,      // 6 hours for search results
      'content': 12 * 3600000,    // 12 hours for fetched content
      'claim': 24 * 3600000,      // 24 hours for claim extractions
      'source': 12 * 3600000      // 12 hours for source analysis
    };
    
    // Clean up expired entries every 30 minutes
    setInterval(() => this.cleanup(), 30 * 60 * 1000);
  }

  generateKey(type, data) {
    // Create a consistent hash for the data
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    return `${type}:${this.simpleHash(dataString)}`;
  }

  simpleHash(str) {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  set(type, key, value, customTTL = null) {
    try {
      const fullKey = typeof key === 'string' ? `${type}:${key}` : this.generateKey(type, key);
      const ttl = customTTL || this.ttlConfig[type] || this.defaultTTL;
      const expiresAt = Date.now() + ttl;

      // If cache is full, remove oldest entries
      if (this.cache.size >= this.maxCacheSize) {
        this.evictOldest();
      }

      this.cache.set(fullKey, {
        value,
        expiresAt,
        createdAt: Date.now(),
        type,
        accessCount: 0
      });

      return true;
    } catch (error) {
      console.warn('Cache set error:', error.message);
      return false;
    }
  }

  get(type, key) {
    try {
      const fullKey = typeof key === 'string' ? `${type}:${key}` : this.generateKey(type, key);
      const entry = this.cache.get(fullKey);

      if (!entry) {
        return null;
      }

      // Check if expired
      if (Date.now() > entry.expiresAt) {
        this.cache.delete(fullKey);
        return null;
      }

      // Update access statistics
      entry.accessCount++;
      entry.lastAccessed = Date.now();

      return entry.value;
    } catch (error) {
      console.warn('Cache get error:', error.message);
      return null;
    }
  }

  has(type, key) {
    const fullKey = typeof key === 'string' ? `${type}:${key}` : this.generateKey(type, key);
    const entry = this.cache.get(fullKey);
    
    if (!entry) return false;
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(fullKey);
      return false;
    }
    
    return true;
  }

  delete(type, key) {
    const fullKey = typeof key === 'string' ? `${type}:${key}` : this.generateKey(type, key);
    return this.cache.delete(fullKey);
  }

  // Cache fact-check results
  cacheFactCheck(claim, result) {
    return this.set('fact-check', claim, result);
  }

  getFactCheck(claim) {
    return this.get('fact-check', claim);
  }

  // Cache search results
  cacheSearchResults(query, results) {
    return this.set('search', query, results);
  }

  getSearchResults(query) {
    return this.get('search', query);
  }

  // Cache fetched content
  cacheContent(url, content) {
    return this.set('content', url, content);
  }

  getContent(url) {
    return this.get('content', url);
  }

  // Cache claim extractions
  cacheClaims(message, claims) {
    return this.set('claim', message, claims);
  }

  getClaims(message) {
    return this.get('claim', message);
  }

  // Cache source analysis
  cacheSourceAnalysis(sources, analysis) {
    const key = sources.map(s => s.url).sort().join('|');
    return this.set('source', key, analysis);
  }

  getSourceAnalysis(sources) {
    const key = sources.map(s => s.url).sort().join('|');
    return this.get('source', key);
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      console.log(`Cache cleanup: removed ${removedCount} expired entries`);
    }
  }

  // Remove oldest entries when cache is full
  evictOldest() {
    let oldestKey = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      const relevantTime = entry.lastAccessed || entry.createdAt;
      if (relevantTime < oldestTime) {
        oldestTime = relevantTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  // Get cache statistics
  getStats() {
    const stats = {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: 0,
      typeBreakdown: {}
    };

    let totalAccess = 0;
    for (const [key, entry] of this.cache.entries()) {
      totalAccess += entry.accessCount;
      
      if (!stats.typeBreakdown[entry.type]) {
        stats.typeBreakdown[entry.type] = 0;
      }
      stats.typeBreakdown[entry.type]++;
    }

    // Calculate approximate hit rate (simplified)
    stats.hitRate = this.cache.size > 0 ? (totalAccess / this.cache.size) : 0;

    return stats;
  }

  // Clear specific type of cache
  clearType(type) {
    let removedCount = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (entry.type === type) {
        this.cache.delete(key);
        removedCount++;
      }
    }
    return removedCount;
  }

  // Clear all cache
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    return size;
  }
}

module.exports = CacheManager;