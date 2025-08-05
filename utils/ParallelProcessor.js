<<<<<<< HEAD
const os = require('os');
const logger = require('./logger');

class ParallelProcessor {
    constructor(maxConcurrency = null) {
        this.maxConcurrency = maxConcurrency || os.cpus().length;
        this.activeJobs = new Map();
        this.queue = [];
    }

    async process(items, processor, options = {}) {
        const {
            batchSize = 5,
            retryCount = 3,
            retryDelay = 1000
        } = options;

        const batches = this.createBatches(items, batchSize);
        const results = [];

        for (const batch of batches) {
            const batchResults = await this.processBatch(
                batch, 
                processor, 
                { retryCount, retryDelay }
            );
            results.push(...batchResults);
        }

        return results;
    }

    createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }

    async processBatch(batch, processor, options) {
        const promises = batch.map(item => 
            this.processItem(item, processor, options)
        );

        return Promise.allSettled(promises).then(results => 
            results.map(result => result.status === 'fulfilled' ? result.value : {
                error: true,
                item: result.reason.item,
                message: result.reason.message
            })
        );
    }

    async processItem(item, processor, options) {
        const { retryCount, retryDelay } = options;
        let lastError;

        for (let attempt = 1; attempt <= retryCount; attempt++) {
            try {
                const result = await processor(item);
                return { success: true, result, item };
            } catch (error) {
                lastError = error;
                
                if (attempt < retryCount) {
                    await new Promise(resolve => 
                        setTimeout(resolve, retryDelay * attempt)
                    );
                }
            }
        }

        throw { item, message: lastError.message };
    }

    async mapWithLimit(items, limit, processor) {
        const results = new Array(items.length);
        let index = 0;

        const worker = async () => {
            while (index < items.length) {
                const currentIndex = index++;
                try {
                    results[currentIndex] = await processor(items[currentIndex], currentIndex);
                } catch (error) {
                    results[currentIndex] = { error: error.message };
                }
            }
        };

        const workers = Array(Math.min(limit, items.length))
            .fill()
            .map(() => worker());

        await Promise.all(workers);
        return results;
    }

    getStats() {
        return {
            activeJobs: this.activeJobs.size,
            queueLength: this.queue.length,
            maxConcurrency: this.maxConcurrency
        };
    }
=======
// parallelProcessor.js
const logger = require('./logger');

class ParallelProcessor {
    async processBatch(tasks, concurrency = 3) {
        const results = [];
        const executing = [];
        
        for (const task of tasks) {
            const promise = Promise.resolve().then(() => task()).then(
                result => ({ status: 'fulfilled', value: result }),
                error => ({ status: 'rejected', reason: error })
            );
            
            results.push(promise);
            
            if (tasks.length >= concurrency) {
                executing.push(promise);
                
                if (executing.length >= concurrency) {
                    await Promise.race(executing);
                    executing.splice(executing.findIndex(p => p === promise), 1);
                }
            }
        }
        
        return Promise.all(results);
    }
>>>>>>> 0c4931a (Qwen 3 Code)
}

module.exports = new ParallelProcessor();