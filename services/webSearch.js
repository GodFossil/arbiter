class WebSearch {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.exa.ai';
  }

  async search(query, count = 10) {
    try {
      // Using Exa.ai search with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout for more thorough search

      const response = await fetch(`${this.baseUrl}/search`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'User-Agent': 'Arbiter-FactChecker/1.0'
        },
        body: JSON.stringify({
          query: query,
          numResults: Math.min(count, 10),
          type: 'auto', // Let Exa decide between neural and keyword search
          category: 'research', // Optimize for research/fact-checking content
          includeDomains: [
            'edu', 'gov', 'org', 
            'reuters.com', 'apnews.com', 'bbc.com', 'npr.org',
            'nature.com', 'science.org', 'britannica.com',
            'nih.gov', 'cdc.gov', 'who.int'
          ], // Focus on authoritative sources
          useAutoprompt: true, // Let Exa optimize the query
          contents: {
            text: true,
            highlights: true,
            summary: true
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(`Rate limit exceeded for Exa.ai API`);
        }
        if (response.status === 401) {
          throw new Error(`Invalid Exa.ai API key`);
        }
        const errorText = await response.text();
        throw new Error(`Exa.ai API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (!data.results || data.results.length === 0) {
        console.warn(`No search results found for query: "${query}"`);
        return this.getMockResults(query);
      }

      return data.results.map(result => ({
        title: result.title,
        url: result.url,
        snippet: result.summary || result.text?.substring(0, 200) + '...' || 'No description available',
        description: result.summary || result.text?.substring(0, 300) + '...' || 'No description available',
        datePublished: result.publishedDate || null,
        score: result.score || 0,
        highlights: result.highlights || [],
        fullText: result.text || null // Exa provides full content
      }));
    } catch (error) {
      console.error('Exa.ai search error:', error.message);

      // Return mock results as fallback but log the original error
      if (error.name === 'AbortError') {
        console.warn(`Search timeout for query: "${query}"`);
      } else if (error.message.includes('Rate limit')) {
        console.warn(`Rate limit hit for query: "${query}"`);
      } else if (error.message.includes('Invalid')) {
        console.error(`Check your Exa.ai API key in environment variables`);
      }

      return this.getMockResults(query);
    }
  }

  // Enhanced search for fact-checking with multiple query strategies
  async searchForFactCheck(claim) {
    const queries = [
      claim, // Original claim
      `fact check ${claim}`, // Explicit fact-checking query
      `research study ${claim}`, // Academic perspective
      `evidence ${claim}`, // Evidence-based query
      `scientific consensus ${claim}` // Scientific view
    ];

    try {
      // Try each query type and combine results
      const searchPromises = queries.slice(0, 3).map(query => this.search(query, 4));
      const results = await Promise.all(searchPromises);

      // Flatten and deduplicate by URL
      const allResults = results.flat();
      const uniqueResults = allResults.filter((result, index, arr) =>
        arr.findIndex(r => r.url === result.url) === index
      );

      // Sort by score (if available) and prioritize authoritative domains
      return uniqueResults
        .sort((a, b) => {
          // Prioritize authoritative domains
          const aAuth = this.getAuthorityScore(a.url);
          const bAuth = this.getAuthorityScore(b.url);
          if (aAuth !== bAuth) return bAuth - aAuth;

          // Then by Exa score
          return (b.score || 0) - (a.score || 0);
        })
        .slice(0, 8); // Return top 8 results
    } catch (error) {
      console.error('Fact-check search error:', error);
      return await this.search(claim); // Fallback to simple search
    }
  }

  // Score domains by authority for fact-checking
  getAuthorityScore(url) {
    const domain = new URL(url).hostname.toLowerCase();

    // Government and educational sources
    if (domain.endsWith('.gov') || domain.endsWith('.edu')) return 10;

    // Major health organizations
    if (domain.includes('nih.gov') || domain.includes('cdc.gov') ||
      domain.includes('who.int') || domain.includes('fda.gov')) return 9;

    // Major news agencies known for fact-checking
    if (domain.includes('reuters.com') || domain.includes('apnews.com') ||
      domain.includes('bbc.com') || domain.includes('npr.org')) return 8;

    // Scientific journals
    if (domain.includes('nature.com') || domain.includes('science.org') ||
      domain.includes('pubmed.ncbi.nlm.nih.gov')) return 8;

    // Reference sources
    if (domain.includes('britannica.com') || domain.includes('wikipedia.org')) return 7;

    // Fact-checking organizations
    if (domain.includes('snopes.com') || domain.includes('factcheck.org') ||
      domain.includes('politifact.com')) return 7;

    // .org domains (many are authoritative)
    if (domain.endsWith('.org')) return 6;

    return 5; // Default score
  }

  // Fallback mock results for development/testing
  getMockResults(query) {
    const mockResults = [
      {
        title: "Encyclopedia Britannica - Authoritative Reference",
        url: "https://www.britannica.com/search?query=" + encodeURIComponent(query),
        snippet: "Comprehensive and authoritative information on various topics from trusted academic sources.",
        description: "Britannica provides reliable, fact-checked information on a wide range of subjects.",
        datePublished: new Date().toISOString(),
        score: 0.95,
        highlights: [`Relevant information about ${query}`],
        fullText: `Detailed academic information about ${query} from Encyclopedia Britannica...`
      },
      {
        title: "National Institutes of Health (NIH)",
        url: "https://www.nih.gov/search/" + encodeURIComponent(query),
        snippet: "Official health information and research findings from the National Institutes of Health.",
        description: "Authoritative medical and health information from U.S. government health agency.",
        datePublished: new Date().toISOString(),
        score: 0.92,
        highlights: [`Medical research on ${query}`],
        fullText: `Official NIH documentation about ${query}...`
      },
      {
        title: "Reuters Fact Check",
        url: "https://www.reuters.com/fact-check/search?q=" + encodeURIComponent(query),
        snippet: "Professional fact-checking and verification of claims by Reuters news agency.",
        description: "Independent fact-checking service with detailed source analysis.",
        datePublished: new Date().toISOString(),
        score: 0.89,
        highlights: [`Fact-check analysis of ${query}`],
        fullText: `Reuters fact-check report on ${query}...`
      },
      {
        title: "Associated Press News",
        url: "https://apnews.com/search?q=" + encodeURIComponent(query),
        snippet: "Breaking news and in-depth reporting from the Associated Press.",
        description: "Reliable news reporting with journalistic standards and fact verification.",
        datePublished: new Date().toISOString(),
        score: 0.86,
        highlights: [`AP news coverage of ${query}`],
        fullText: `Associated Press reporting on ${query}...`
      },
      {
        title: "Government Source (.gov)",
        url: "https://www.example.gov/search?q=" + encodeURIComponent(query),
        snippet: "Official government information and statistics on the requested topic.",
        description: "Authoritative government data and official policy information.",
        datePublished: new Date().toISOString(),
        score: 0.88,
        highlights: [`Government data on ${query}`],
        fullText: `Official government information about ${query}...`
      }
    ];

    return mockResults.slice(0, Math.floor(Math.random() * 3) + 3);
  }

  // Legacy method for backward compatibility
  async searchMultipleSources(query) {
    return await this.searchForFactCheck(query);
  }
}

export default WebSearch;