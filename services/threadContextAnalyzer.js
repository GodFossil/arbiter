class ThreadContextAnalyzer {
  constructor(openai, cacheManager = null) {
    this.openai = openai;
    this.cacheManager = cacheManager;
    this.model = "gpt-4o"; // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
  }

  async analyzeThreadContext(currentMessage, threadHistory, userId, channelId) {
    try {
      // Check cache for recent thread analysis
      const cacheKey = this.generateThreadCacheKey(threadHistory, currentMessage);
      if (this.cacheManager) {
        const cachedAnalysis = this.cacheManager.get('thread-context', cacheKey);
        if (cachedAnalysis) {
          console.log('Using cached thread context analysis');
          return cachedAnalysis;
        }
      }

      const threadAnalysis = await this.performThreadAnalysis(currentMessage, threadHistory, userId);
      
      // Cache the analysis
      if (this.cacheManager && threadAnalysis) {
        this.cacheManager.set('thread-context', cacheKey, threadAnalysis, 1800000); // 30 minutes TTL
      }

      return threadAnalysis;

    } catch (error) {
      console.error('Thread context analysis error:', error);
      return null;
    }
  }

  async performThreadAnalysis(currentMessage, threadHistory, userId) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
You are an expert at analyzing conversation threads to understand context for fact-checking.

Analyze the conversation thread to provide context for fact-checking the current message. Consider:
1. **Conversation Topic**: What is the main subject being discussed?
2. **User's Position**: What stance has the user taken on this topic?
3. **Supporting Evidence**: What evidence or sources has the user provided?
4. **Consistency**: Are there any contradictions in the user's statements over time?
5. **Debate Context**: Is this an ongoing debate? Who are the participants?
6. **Temporal Context**: When did key statements occur in the conversation?
7. **Emotional Tone**: Is the discussion heated, academic, casual?
8. **Claim Evolution**: How have claims or positions evolved during the conversation?

Respond with JSON:
{
  "conversation_topic": "main discussion topic",
  "user_position": "user's stated position on the topic",
  "key_claims_made": ["claim1", "claim2", "claim3"],
  "evidence_provided": ["source1", "source2"],
  "consistency_issues": ["inconsistency1", "inconsistency2"] or [],
  "debate_participants": ["user1", "user2"],
  "emotional_tone": "academic|heated|casual|skeptical|confident",
  "current_message_context": "how current message fits in the conversation",
  "fact_check_priority": "high|medium|low",
  "suggested_focus": "what specific aspects to prioritize in fact-checking",
  "conversation_stage": "opening|developing|peak|concluding",
  "relevant_history": "key context from earlier in conversation"
}
            `.trim(),
          },
          {
            role: "user",
            content: `
Thread History (last 15 messages):
${this.formatThreadHistory(threadHistory)}

Current Message: "${currentMessage}"

User ID: ${userId}

Analyze this conversation thread to provide context for fact-checking the current message.
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Thread analysis API error:', error);
      return null;
    }
  }

  formatThreadHistory(threadHistory) {
    if (!threadHistory || threadHistory.length === 0) {
      return "No previous messages in thread.";
    }

    return threadHistory
      .slice(-15) // Last 15 messages for context
      .map((msg, index) => {
        const timestamp = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : '';
        const username = msg.username || msg.author || 'Unknown';
        const content = msg.content || msg.message || '';
        return `[${timestamp}] ${username}: ${content}`;
      })
      .join('\n');
  }

  generateThreadCacheKey(threadHistory, currentMessage) {
    // Create a hash-like key based on recent messages
    const recentMessages = threadHistory.slice(-5).map(msg => msg.content).join('|');
    const combinedContent = recentMessages + '|' + currentMessage;
    return this.simpleHash(combinedContent);
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

  async extractThreadClaims(threadHistory, currentUserId) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Extract all factual claims made by the specified user throughout this conversation thread.

Focus on:
1. Factual assertions (not opinions)
2. Claims that can be verified
3. Statements that contradict each other
4. Evidence or sources cited

Respond with JSON:
{
  "user_claims": [
    {
      "claim": "the actual claim text",
      "message_index": number,
      "timestamp": "when it was said",
      "confidence": 0.0-1.0
    }
  ],
  "contradictions": [
    {
      "claim1": "first claim",
      "claim2": "contradicting claim", 
      "explanation": "why they contradict"
    }
  ],
  "sources_cited": ["source1", "source2"]
}
            `.trim(),
          },
          {
            role: "user",
            content: `
Thread History:
${this.formatThreadHistory(threadHistory)}

Extract claims made by user ID: ${currentUserId}
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Thread claims extraction error:', error);
      return {
        user_claims: [],
        contradictions: [],
        sources_cited: []
      };
    }
  }

  async analyzeConversationTrend(threadHistory, topicKeywords) {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `
Analyze the conversation trend and dynamics around the given topic.

Consider:
1. How opinions have evolved
2. Whether misinformation is spreading
3. If authoritative sources have been cited
4. The quality of the debate
5. Patterns in user behavior

Respond with JSON:
{
  "trend_direction": "improving|declining|stable",
  "misinformation_risk": "high|medium|low",
  "debate_quality": "excellent|good|poor",
  "authority_sources_present": boolean,
  "key_turning_points": ["description of significant moments"],
  "recommendation": "how to best fact-check given the context"
}
            `.trim(),
          },
          {
            role: "user",
            content: `
Topic Keywords: ${topicKeywords.join(', ')}

Thread History:
${this.formatThreadHistory(threadHistory)}

Analyze the conversation trend for fact-checking purposes.
            `,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      console.error('Conversation trend analysis error:', error);
      return null;
    }
  }

  // Enhanced thread retrieval for Discord messages
  async getEnhancedThreadHistory(message, lookbackLimit = 20) {
    try {
      const messages = [];
      
      // Get channel message history
      const fetchedMessages = await message.channel.messages.fetch({ 
        limit: lookbackLimit,
        before: message.id 
      });

      // Convert to our format
      fetchedMessages.reverse().forEach(msg => {
        if (!msg.author.bot) { // Exclude bot messages from context
          messages.push({
            id: msg.id,
            username: msg.author.username,
            displayName: msg.member?.displayName || msg.author.username,
            userId: msg.author.id,
            content: msg.content,
            timestamp: msg.createdTimestamp,
            isReply: !!msg.reference,
            replyToId: msg.reference?.messageId,
            mentions: msg.mentions.users.map(user => user.id),
            attachments: msg.attachments.size > 0
          });
        }
      });

      return messages;
    } catch (error) {
      console.error('Error fetching thread history:', error);
      return [];
    }
  }

  // Determine if current message is part of an ongoing discussion
  isPartOfDiscussion(currentMessage, threadHistory, timeThresholdMinutes = 30) {
    if (!threadHistory || threadHistory.length === 0) return false;

    const currentTime = Date.now();
    const timeThreshold = timeThresholdMinutes * 60 * 1000;

    // Check if recent messages are related
    const recentMessages = threadHistory.filter(msg => 
      (currentTime - msg.timestamp) < timeThreshold
    );

    if (recentMessages.length < 2) return false;

    // Simple keyword overlap check (could be enhanced with semantic similarity)
    const currentWords = currentMessage.toLowerCase().split(/\s+/);
    const recentWords = recentMessages
      .map(msg => msg.content.toLowerCase().split(/\s+/))
      .flat();

    const overlap = currentWords.filter(word => 
      word.length > 3 && recentWords.includes(word)
    );

    return overlap.length >= 2; // At least 2 significant word overlaps
  }
}

module.exports = ThreadContextAnalyzer;