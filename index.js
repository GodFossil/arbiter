<<<<<<< HEAD
require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const logger = require('./logger');
const { handleError } = require('./errorHandler');
const { factCheckMessage } = require('./factChecker');
const { buildFactCheckReply } = require('./FactCheck');
const { connect } = require('./db');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, () => {
  logger.info(`Bot logged in as ${client.user.tag}`);
  connect(); // optional Mongo
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;

  try {
    const results = await factCheckMessage(message.content);
    if (!results || !results.length) return;

    for (const r of results) {
      const reply = await buildFactCheckReply(r.claim, r.verdict, r.sources, r.confidence);
      await message.reply(reply.slice(0, 2000));
    }
  } catch (err) {
    handleError(err, message);
  }
});

=======
// index.js
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const FactCheck = require('./FactCheck');
const logger = require('./logger');
const geminiClient = require('./geminiClient');

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

client.once('ready', () => {
    logger.info(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Check if bot is mentioned or DM
    if (message.mentions.has(client.user) || message.channel.type === 1) {
        try {
            // Acknowledge receipt
            await message.channel.sendTyping();
            
            // Process the message
            const result = await FactCheck.processMessage(message);
            
            if (result.success) {
                // Generate response using Gemini
                let responseText;
                
                try {
                    const prompt = `
                    You are a helpful fact-checking assistant. A user sent this message: "${message.content}"
                    
                    Here is the fact-check analysis:
                    ${result.result.summary}
                    
                    Please provide a concise, friendly response to the user summarizing these findings.
                    `;
                    
                    responseText = await geminiClient.generateContent(
                        prompt,
                        'gemini-1.5-pro',
                        { maxTokens: 1500 }
                    );
                } catch (proError) {
                    logger.warn('gemini-1.5-pro failed, falling back to gemini-1.5-flash:', proError.message);
                    
                    try {
                        const prompt = `
                        You are a helpful fact-checking assistant. A user sent this message: "${message.content}"
                        
                        Here is the fact-check analysis:
                        ${result.result.summary}
                        
                        Please provide a concise, friendly response to the user summarizing these findings.
                        `;
                        
                        responseText = await geminiClient.generateContent(
                            prompt,
                            'gemini-1.5-flash',
                            { maxTokens: 1500 }
                        );
                    } catch (flashError) {
                        logger.error('Both Gemini models failed:', flashError.message);
                        responseText = "I'm having trouble generating a response right now. Here's what I found:\n\n" + result.result.summary;
                    }
                }
                
                // Send response
                await message.reply(responseText);
            } else {
                await message.reply("Sorry, I encountered an error while processing your request.");
                logger.error('FactCheck processing error:', result.error);
            }
        } catch (error) {
            logger.error('Message processing error:', error);
            await message.reply("Sorry, I encountered an error while processing your request.");
        }
    }
});

// Handle errors
client.on('error', error => {
    logger.error('Discord client error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down...');
    client.destroy();
    process.exit(0);
});

// Login to Discord
>>>>>>> 0c4931a (Qwen 3 Code)
client.login(process.env.DISCORD_TOKEN);