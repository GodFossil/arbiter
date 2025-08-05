const axios = require('axios');
const logger = require('./logger');

class ThreadContextAnalyzer {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;
        this.model = 'gemini-2.5-flash-lite';
        this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    }

    async getContext(thread) {
        try {
            // Fetch last 20 messages from thread
            const messages = await thread.messages.fetch({ limit: 20 });
            const messageArray = Array.from(messages.values()).reverse();
            
            // Build context string
            const context = messageArray
                .filter(msg => !msg.author.bot)
                .map(msg => `${msg.author.username}: ${msg.content}`)
                .join('\n');

            // Analyze context for key topics and tone
            const prompt = `Analyze this conversation context:

${context}

Provide a JSON summary with:
{
    "topics": ["main topics discussed"],
    "tone": "serious|casual|debate|questioning",
    "key_points": ["important facts mentioned"],
    "context_needed": "brief context for fact-checking"
}`;

            const response = await axios.post(`${this.apiUrl}?key=${this.apiKey}`, {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 0.1,
                    maxOutputTokens: 1024
                }
            });

            const content = response.data.candidates[0].content.parts[0].text;
            const analysis = JSON.parse(content);
            
            logger.info(`Analyzed thread context: ${analysis.topics.join(', ')}`);
            return {
                conversation: context,
                summary: analysis,
                messageCount: messageArray.length
            };
        } catch (error) {
            logger.error('Error analyzing thread context:', error);
            return {
                conversation: '',
                summary: {
                    topics: [],
                    tone: 'unknown',
                    key_points: [],
                    context_needed: 'Unable to analyze context'
                },
                messageCount: 0
            };
        }
    }

    async getRelevantMessages(thread, claim) {
        try {
            const messages = await thread.messages.fetch({ limit: 50 });
            
            const prompt = `Find messages relevant to: "${claim}"

Messages:
${messages.map(m => `${m.author.username}: ${m.content}`).join('\n')}

Return JSON array of relevant message IDs`;

            const response = await axios.post(`${this.apiUrl}?key=${this.apiKey}`, {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 0.1,
                    maxOutputTokens: 512
                }
            });

            const content = response.data.candidates[0].content.parts[0].text;
            const relevantIds = JSON.parse(content);
            
            return messages.filter(m => relevantIds.includes(m.id));
        } catch (error) {
            logger.error('Error finding relevant messages:', error);
            return [];
        }
    }

    async detectTopicShift(currentMessage, threadHistory) {
        try {
            const prompt = `Check if this message shifts the topic:

Current message: "${currentMessage}"

Thread history:
${threadHistory.slice(-5).map(m => m.content).join('\n')}

Return JSON: {"topic_shift": boolean, "new_topic": "topic if shifted"}`;

            const response = await axios.post(`${this.apiUrl}?key=${this.apiKey}`, {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 0.1,
                    maxOutputTokens: 256
                }
            });

            const content = response.data.candidates[0].content.parts[0].text;
            return JSON.parse(content);
        } catch (error) {
            logger.error('Error detecting topic shift:', error);
            return { topic_shift: false };
        }
    }
}

module.exports = new ThreadContextAnalyzer();