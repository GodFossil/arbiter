class ParallelProcessor {
  constructor(maxConcurrency = 5) {
    this.maxConcurrency = maxConcurrency;
    this.activeJobs = 0;
    this.queue = [];
  }

  async processClaims(claims, factChecker, options = {}) {
    const {
      batchSize = this.maxConcurrency,
      onProgress = null,
      timeout = 30000 // 30 second timeout per claim
    } = options;

    if (!claims || claims.length === 0) {
      return [];
    }

    const results = [];
    const totalClaims = claims.length;

    console.log(`Processing ${totalClaims} claims with max concurrency: ${batchSize}`);

    // Process claims in batches to avoid overwhelming APIs
    for (let i = 0; i < claims.length; i += batchSize) {
      const batch = claims.slice(i, i + batchSize);
      const batchPromises = batch.map((claim, index) => 
        this.processClaimWithTimeout(claim, factChecker, timeout, i + index)
      );

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, batchIndex) => {
          const globalIndex = i + batchIndex;
          
          if (result.status === 'fulfilled') {
            results[globalIndex] = result.value;
          } else {
            console.error(`Claim ${globalIndex} failed:`, result.reason?.message || 'Unknown error');
            results[globalIndex] = {
              claim: batch[batchIndex],
              status: 'error',
              confidence: 0,
              sources: [],
              reasoning: `Processing failed: ${result.reason?.message || 'Unknown error'}`,
              verification_steps: ['error']
            };
          }

          // Report progress if callback provided
          if (onProgress) {
            onProgress(globalIndex + 1, totalClaims, results[globalIndex]);
          }
        });

        // Add delay between batches to respect API rate limits
        if (i + batchSize < claims.length) {
          await this.delay(1000); // 1 second delay between batches
        }

      } catch (error) {
        console.error(`Batch processing error for claims ${i}-${i + batchSize - 1}:`, error);
        
        // Add error results for the entire batch
        for (let j = 0; j < batch.length; j++) {
          results[i + j] = {
            claim: batch[j],
            status: 'error',
            confidence: 0,
            sources: [],
            reasoning: `Batch processing failed: ${error.message}`,
            verification_steps: ['error']
          };
        }
      }
    }

    console.log(`Completed processing ${results.length} claims`);
    return results;
  }

  async processClaimWithTimeout(claim, factChecker, timeout, index) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Claim verification timeout after ${timeout}ms`));
      }, timeout);

      try {
        console.log(`Processing claim ${index}: "${claim.substring(0, 50)}..."`);
        const result = await factChecker.verifyClaimMultiStep(claim);
        clearTimeout(timeoutId);
        console.log(`Completed claim ${index} with status: ${result.status}`);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        console.error(`Error processing claim ${index}:`, error.message);
        reject(error);
      }
    });
  }

  async processSourcesParallel(sources, processor, options = {}) {
    const {
      batchSize = 3, // Smaller batch size for source processing
      onProgress = null,
      timeout = 15000 // 15 second timeout per source
    } = options;

    if (!sources || sources.length === 0) {
      return [];
    }

    const results = [];
    const totalSources = sources.length;

    for (let i = 0; i < sources.length; i += batchSize) {
      const batch = sources.slice(i, i + batchSize);
      const batchPromises = batch.map((source, index) => 
        this.processSourceWithTimeout(source, processor, timeout, i + index)
      );

      try {
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, batchIndex) => {
          const globalIndex = i + batchIndex;
          
          if (result.status === 'fulfilled') {
            results[globalIndex] = result.value;
          } else {
            results[globalIndex] = {
              ...batch[batchIndex],
              error: result.reason?.message || 'Unknown error',
              content: null
            };
          }

          if (onProgress) {
            onProgress(globalIndex + 1, totalSources, results[globalIndex]);
          }
        });

        // Respectful delay between batches
        if (i + batchSize < sources.length) {
          await this.delay(2000); // 2 second delay for source processing
        }

      } catch (error) {
        console.error(`Source batch processing error:`, error);
        
        for (let j = 0; j < batch.length; j++) {
          results[i + j] = {
            ...batch[j],
            error: `Batch processing failed: ${error.message}`,
            content: null
          };
        }
      }
    }

    return results;
  }

  async processSourceWithTimeout(source, processor, timeout, index) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Source processing timeout after ${timeout}ms`));
      }, timeout);

      try {
        const result = await processor(source);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  // Process search queries in parallel
  async processSearchQueries(queries, webSearch, options = {}) {
    const { maxConcurrent = 2 } = options; // Conservative for search APIs
    
    const results = [];
    
    for (let i = 0; i < queries.length; i += maxConcurrent) {
      const batch = queries.slice(i, i + maxConcurrent);
      const promises = batch.map(query => webSearch.search(query));
      
      const batchResults = await Promise.allSettled(promises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(...result.value);
        } else {
          console.warn(`Search query failed: ${batch[index]}`, result.reason?.message);
        }
      });

      // Rate limiting for search API
      if (i + maxConcurrent < queries.length) {
        await this.delay(1500); // 1.5 second delay for search queries
      }
    }

    return results;
  }

  // Utility to create a queue for managing concurrent operations
  async addToQueue(task, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        priority,
        resolve,
        reject,
        createdAt: Date.now()
      });

      this.processQueue();
    });
  }

  async processQueue() {
    if (this.activeJobs >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    // Sort queue by priority (higher first) then by creation time
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.createdAt - b.createdAt;
    });

    const job = this.queue.shift();
    this.activeJobs++;

    try {
      const result = await job.task();
      job.resolve(result);
    } catch (error) {
      job.reject(error);
    } finally {
      this.activeJobs--;
      // Process next item in queue
      setImmediate(() => this.processQueue());
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get processing statistics
  getStats() {
    return {
      activeJobs: this.activeJobs,
      queueLength: this.queue.length,
      maxConcurrency: this.maxConcurrency
    };
  }

  // Update concurrency limit
  setConcurrency(newLimit) {
    this.maxConcurrency = Math.max(1, newLimit);
    this.processQueue(); // Process any queued items with new limit
  }
}

module.exports = ParallelProcessor;