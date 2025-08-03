class ContentFetcher {
  constructor() {
    this.timeout = 10000; // 10 second timeout
    this.maxContentLength = 50000; // Limit content size
  }

  async fetchPageContent(url, retries = 2) {
    try {
      // Add user agent to avoid bot blocking
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Arbiter-FactChecker/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        },
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('text/html')) {
        throw new Error('Content is not HTML');
      }

      let content = await response.text();
      
      // Limit content size to prevent memory issues
      if (content.length > this.maxContentLength) {
        content = content.substring(0, this.maxContentLength);
      }

      return this.extractMainContent(content);

    } catch (error) {
      if (retries > 0 && !error.name === 'AbortError') {
        console.log(`Retrying content fetch for ${url}, attempts left: ${retries}`);
        await this.delay(1000); // Wait 1 second before retry
        return this.fetchPageContent(url, retries - 1);
      }
      
      console.warn(`Failed to fetch content from ${url}: ${error.message}`);
      return null;
    }
  }

  extractMainContent(html) {
    try {
      // Remove script, style, and other non-content tags
      let cleanContent = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

      // Extract text content from common article containers
      const contentPatterns = [
        /<article[^>]*>([\s\S]*?)<\/article>/gi,
        /<main[^>]*>([\s\S]*?)<\/main>/gi,
        /<div[^>]*class[^>]*(?:content|article|post|entry)[^>]*>([\s\S]*?)<\/div>/gi,
        /<div[^>]*id[^>]*(?:content|article|post|entry)[^>]*>([\s\S]*?)<\/div>/gi
      ];

      let extractedContent = '';
      for (const pattern of contentPatterns) {
        const matches = cleanContent.matchAll(pattern);
        for (const match of matches) {
          if (match[1] && match[1].length > extractedContent.length) {
            extractedContent = match[1];
          }
        }
      }

      // If no specific content containers found, use body
      if (!extractedContent) {
        const bodyMatch = cleanContent.match(/<body[^>]*>([\s\S]*?)<\/body>/gi);
        if (bodyMatch && bodyMatch[0]) {
          extractedContent = bodyMatch[0];
        } else {
          extractedContent = cleanContent;
        }
      }

      // Remove all HTML tags and clean up text
      let textContent = extractedContent
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      // Filter out navigation, menu, and footer text
      const linesToFilter = textContent.split('\n').filter(line => {
        const lowerLine = line.toLowerCase().trim();
        return !lowerLine.includes('cookie') &&
               !lowerLine.includes('privacy policy') &&
               !lowerLine.includes('terms of service') &&
               !lowerLine.includes('subscribe') &&
               !lowerLine.includes('newsletter') &&
               !lowerLine.includes('advertisement') &&
               lowerLine.length > 20; // Filter out very short lines
      });

      return linesToFilter.join('\n').trim();

    } catch (error) {
      console.warn('Content extraction failed:', error.message);
      return null;
    }
  }

  async fetchMultipleUrls(urls, maxConcurrent = 3) {
    const results = [];
    
    for (let i = 0; i < urls.length; i += maxConcurrent) {
      const batch = urls.slice(i, i + maxConcurrent);
      const promises = batch.map(async (url) => {
        const content = await this.fetchPageContent(url);
        return { url, content, success: content !== null };
      });

      const batchResults = await Promise.allSettled(promises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            url: batch[index],
            content: null,
            success: false,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });

      // Add delay between batches to be respectful to servers
      if (i + maxConcurrent < urls.length) {
        await this.delay(1000);
      }
    }

    return results;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Utility to determine if URL is likely to contain useful content
  isContentUrl(url) {
    const excludePatterns = [
      /\.(jpg|jpeg|png|gif|svg|pdf|doc|docx|xlsx|zip)$/i,
      /\/search\?/,
      /\/login|\/register|\/signup/i,
      /facebook\.com|twitter\.com|instagram\.com|tiktok\.com/i
    ];

    return !excludePatterns.some(pattern => pattern.test(url));
  }
}

module.exports = ContentFetcher;