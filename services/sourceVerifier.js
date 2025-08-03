class SourceVerifier {
  constructor(openai, webSearch, contentFetcher = null, cacheManager = null, errorHandler = null) {
    this.openai = openai;
    this.webSearch = webSearch;
    this.contentFetcher = contentFetcher;
    this.cacheManager = cacheManager;
    this.errorHandler = errorHandler;
    this.model = "gpt-4o"; // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
  }

  async findAuthoritativeSources(claim) {
    try {
      // Step 1: Generate search queries
      const searchQueries = await this.generateSearchQueries(claim);
      
      // Step 2: Perform web searches
      const allResults = [];
      for (const query of searchQueries.slice(0, 3)) { // Limit to 3 queries
        const results = await this.webSearch.search(query);
        allResults.push(...results);
      }

      // Step 3: Filter and rank sources by credibility
      const credibleSources = await this.filterCredibleSources(allResults);
      
      // Step 4: Extract relevant content from top sources
      const sourcesWithContent = await this.extractRelevantContent(credibleSources.slice(0, 10), claim);

      return sourcesWithContent;
    } catch (error) {
      console.error("Source verification error:", error);
      return [];
    }
  }

  async generateSearchQueries(claim) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Generate effective search queries to fact-check this claim. Create queries that would find:
1. Direct information about the claim
2. Authoritative sources on the topic
3. Potential counter-evidence

Respond with JSON:
{
  "queries": ["query1", "query2", "query3", "query4"]
}
            `.trim(),
          },
          {
            role: "user",
            content: `Claim to fact-check: "${claim}"`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
      });

      const result = JSON.parse(response.choices[0].message.content);
      return result.queries || [claim];
    } catch (error) {
      console.error("Search query generation error:", error);
      return [claim]; // Fallback to the claim itself
    }
  }

  async filterCredibleSources(searchResults) {
    // Define credible domains and patterns
    const credibleDomains = [
      'edu', 'gov', 'org',
      'nature.com', 'science.org', 'nejm.org', 'bmj.com',
      'reuters.com', 'ap.org', 'bbc.com', 'npr.org',
      'who.int', 'cdc.gov', 'nih.gov', 'nasa.gov',
      'worldbank.org', 'un.org', 'britannica.com'
    ];

    const lessCredibleDomains = [
      'blogspot.com', 'wordpress.com', 'medium.com',
      'facebook.com', 'twitter.com', 'reddit.com',
      'youtube.com', 'tiktok.com'
    ];

    return searchResults
      .filter(result => {
        const url = result.url.toLowerCase();
        
        // Prioritize credible domains
        if (credibleDomains.some(domain => url.includes(domain))) {
          result.credibilityScore = 0.9;
          return true;
        }
        
        // Deprioritize less credible domains
        if (lessCredibleDomains.some(domain => url.includes(domain))) {
          result.credibilityScore = 0.3;
          return false; // Filter out for now
        }
        
        // Default credibility for other domains
        result.credibilityScore = 0.6;
        return true;
      })
      .sort((a, b) => b.credibilityScore - a.credibilityScore);
  }

  async extractRelevantContent(sources, claim) {
    const sourcesWithContent = [];
    
    // Use parallel processing if available
    if (this.contentFetcher && sources.length > 1) {
      return this.extractContentParallel(sources, claim);
    }
    
    for (const source of sources.slice(0, 5)) { // Limit processing
      try {
        let content = source.snippet || source.description || '';
        
        // Try to fetch full content if fetcher is available and URL is suitable
        if (this.contentFetcher && this.contentFetcher.isContentUrl(source.url)) {
          // Check cache first
          const cachedContent = this.cacheManager?.getContent(source.url);
          
          if (cachedContent) {
            content = cachedContent;
          } else {
            const fetchedContent = await this.contentFetcher.fetchPageContent(source.url);
            if (fetchedContent && fetchedContent.length > content.length) {
              content = fetchedContent;
              // Cache the fetched content
              this.cacheManager?.cacheContent(source.url, content);
            }
          }
        }
        
        if (content.length > 50) { // Only include sources with substantial content
          sourcesWithContent.push({
            title: source.title,
            url: source.url,
            content: content.substring(0, 5000), // Limit content size for processing
            credibilityScore: source.credibilityScore || 0.6,
            domain: this.extractDomain(source.url),
            contentType: content.length > 1000 ? 'full' : 'snippet'
          });
        }
      } catch (error) {
        if (this.errorHandler) {
          await this.errorHandler.handleError(error, {
            service: 'sourceVerifier',
            url: source.url,
            operation: 'extractContent'
          });
        } else {
          console.error(`Error processing source ${source.url}:`, error);
        }
      }
    }

    return sourcesWithContent;
  }

  async extractContentParallel(sources, claim) {
    const topSources = sources.slice(0, 5);
    const urlsToFetch = topSources
      .filter(source => this.contentFetcher.isContentUrl(source.url))
      .map(source => source.url);

    // Fetch content for multiple URLs in parallel
    const fetchResults = await this.contentFetcher.fetchMultipleUrls(urlsToFetch, 2);
    
    // Create a map for quick lookup
    const contentMap = new Map();
    fetchResults.forEach(result => {
      if (result.success && result.content) {
        contentMap.set(result.url, result.content);
        // Cache successful fetches
        this.cacheManager?.cacheContent(result.url, result.content);
      }
    });

    // Combine with original sources
    const sourcesWithContent = [];
    for (const source of topSources) {
      const fetchedContent = contentMap.get(source.url);
      const content = fetchedContent || source.snippet || source.description || '';
      
      if (content.length > 50) {
        sourcesWithContent.push({
          title: source.title,
          url: source.url,
          content: content.substring(0, 5000),
          credibilityScore: source.credibilityScore || 0.6,
          domain: this.extractDomain(source.url),
          contentType: fetchedContent ? 'full' : 'snippet'
        });
      }
    }

    return sourcesWithContent;
  }

  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (error) {
      return 'unknown';
    }
  }

  async assessSourceCredibility(sources) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Assess the overall credibility of these sources for fact-checking.

Consider:
- Domain authority and reputation
- Content quality and depth
- Potential bias or agenda
- Recency and relevance

Respond with JSON:
{
  "overall_credibility": 0.0-1.0,
  "source_assessment": [
    {
      "url": "source_url",
      "credibility": 0.0-1.0,
      "reasoning": "explanation"
    }
  ],
  "recommendation": "high_confidence|moderate_confidence|low_confidence|insufficient"
}
            `.trim(),
          },
          {
            role: "user",
            content: `Sources to assess: ${JSON.stringify(sources.map(s => ({
              title: s.title,
              url: s.url,
              domain: s.domain
            })), null, 2)}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error("Source credibility assessment error:", error);
      return {
        overall_credibility: 0.5,
        source_assessment: [],
        recommendation: "low_confidence"
      };
    }
  }
}

module.exports = SourceVerifier;
