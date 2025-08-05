const { Client, GatewayIntentBits, Partials } = require('discord.js');
const factChecker = require('./factChecker');
const interactiveVerifier = require('./interactiveVerifier');
const threadContextAnalyzer = require('./threadContextAnalyzer');
const logger = require('./logger');
const errorHandler = require('./errorHandler');
require('dotenv').config();

class DiscordBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildMessageReactions
            ],
            partials: [Partials.Channel]
        });

        this.setupEventHandlers();
    }

    setupEventHandlers() {
        this.client.once('ready', () => {
            logger.info(`Bot logged in as ${this.client.user.tag}`);
            this.startPresenceUpdate();
        });

        this.client.on('messageCreate', async (message) => {
            if (message.author.bot) return;
            await this.handleMessage(message);
        });

        this.client.on('interactionCreate', async (interaction) => {
            if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
            await interactiveVerifier.handleInteraction(interaction);
        });

        this.client.on('error', (error) => {
            logger.error('Discord client error:', error);
        });

        process.on('unhandledRejection', (error) => {
            logger.error('Unhandled promise rejection:', error);
        });
    }

    async handleMessage(message) {
        try {
            // Check if bot is mentioned or in thread
            const isMentioned = message.mentions.has(this.client.user);
            const isInThread = message.channel.isThread();
            
            if (!isMentioned && !isInThread) return;

            // Get context for thread messages
            let context = {};
            if (isInThread) {
                context = await threadContextAnalyzer.getContext(message.channel);
            }

            // Parse command
            const content = message.content.replace(`<@${this.client.user.id}>`, '').trim();
            
            if (content.startsWith('factcheck') || content.startsWith('fc')) {
                const claim = content.replace(/^(factcheck|fc)\s*/i, '').trim();
                if (!claim) {
                    await message.reply('Please provide a message to fact-check. Usage: `@bot factcheck <message>`');
                    return;
                }

                await this.processFactCheck(message, claim, context);
            } else if (content.startsWith('verify')) {
                const url = content.replace(/^verify\s*/i, '').trim();
                if (!url) {
                    await message.reply('Please provide a URL to verify. Usage: `@bot verify <url>`');
                    return;
                }

                await this.processUrlVerification(message, url);
            } else if (content === 'help') {
                await this.sendHelp(message);
            } else if (isInThread) {
                // Auto-check thread messages
                await this.processFactCheck(message, content, context, true);
            }

        } catch (error) {
            logger.error('Error handling message:', error);
            await errorHandler.handle(error, { type: 'message_handler', message: message.content });
        }
    }

    async processFactCheck(message, claim, context = {}, silent = false) {
        try {
            if (!silent) {
                await message.channel.sendTyping();
            }

            const result = await factChecker.processMessage(claim, context);

            if (result.type === 'no_claims') {
                if (!silent) {
                    await message.reply(result.message);
                }
                return;
            }

            const embed = this.createFactCheckEmbed(result, message.author);
            
            if (silent) {
                // In threads, send without ping
                await message.channel.send({ embeds: [embed], components: [this.createActionRow()] });
            } else {
                await message.reply({ embeds: [embed], components: [this.createActionRow()] });
            }

        } catch (error) {
            logger.error('Error processing fact-check:', error);
            await message.reply('Sorry, I encountered an error while fact-checking. Please try again later.');
        }
    }

    async processUrlVerification(message, url) {
        try {
            await message.channel.sendTyping();
            
            const verification = await factChecker.processUrlVerification(url);
            const embed = this.createVerificationEmbed(verification, message.author);
            
            await message.reply({ embeds: [embed] });
        } catch (error) {
            logger.error('Error processing URL verification:', error);
            await message.reply('Sorry, I encountered an error while verifying the URL.');
        }
    }

    createFactCheckEmbed(result, author) {
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('🔍 Fact Check Results')
            .setColor(0x0099ff)
            .setTimestamp()
            .setFooter({ text: `Requested by ${author.username}`, iconURL: author.displayAvatarURL() });

        result.claims.forEach((claim, index) => {
            const verdict = claim.factCheck.verdict;
            const color = this.getVerdictColor(verdict);
            
            embed.addFields({
                name: `Claim ${index + 1}: ${claim.claim.substring(0, 100)}${claim.claim.length > 100 ? '...' : ''}`,
                value: [
                    `**Verdict:** ${this.formatVerdict(verdict)}`,
                    `**Confidence:** ${claim.confidence?.score || 0}%`,
                    `**Explanation:** ${claim.factCheck.explanation || 'No explanation available'}`,
                    `**Sources:** ${claim.sources.length || 'None found'}`
                ].join('\n'),
                inline: false
            });
        });

        return embed;
    }

    createVerificationEmbed(verification, author) {
        const { EmbedBuilder } = require('discord.js');
        
        return new EmbedBuilder()
            .setTitle(`🔗 Source Verification: ${verification.title}`)
            .setURL(verification.url)
            .setColor(verification.reliability === 'high' ? 0x00ff00 : 
                     verification.reliability === 'medium' ? 0xffff00 : 0xff0000)
            .setDescription(verification.summary || verification.content?.substring(0, 200) + '...')
            .addFields(
                { name: 'Reliability', value: verification.reliability || 'Unknown', inline: true },
                { name: 'Last Updated', value: verification.lastUpdated || 'Unknown', inline: true },
                { name: 'Author/Organization', value: verification.author || 'Unknown', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: `Verified by ${author.username}`, iconURL: author.displayAvatarURL() });
    }

    createActionRow() {
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('verify_sources')
                    .setLabel('Verify Sources')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('more_info')
                    .setLabel('More Info')
                    .setStyle(ButtonStyle.Secondary)
            );
    }

    formatVerdict(verdict) {
        const emojis = {
            true: '✅ True',
            false: '❌ False',
            partially_true: '⚠️ Partially True',
            unverifiable: '❓ Unverifiable',
            misleading: '🚨 Misleading'
        };
        return emojis[verdict] || verdict;
    }

    getVerdictColor(verdict) {
        const colors = {
            true: 0x00ff00,
            false: 0xff0000,
            partially_true: 0xffff00,
            unverifiable: 0x808080,
            misleading: 0xff8c00
        };
        return colors[verdict] || 0x0099ff;
    }

    async sendHelp(message) {
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('🤖 Fact-Check Bot Help')
            .setDescription('I can help you fact-check messages and verify sources!')
            .addFields(
                { name: 'Commands', value: [
                    '`@bot factcheck <message>` - Check a specific message',
                    '`@bot fc <message>` - Short form of factcheck',
                    '`@bot verify <url>` - Verify a specific source',
                    '`@bot help` - Show this help message'
                ].join('\n') },
                { name: 'Features', value: [
                    '• Real-time fact-checking',
                    '• Source verification',
                    '• Confidence scoring',
                    '• Web search integration',
                    '• Thread context analysis'
                ].join('\n') }
            )
            .setColor(0x0099ff);

        await message.reply({ embeds: [embed] });
    }

    startPresenceUpdate() {
        const activities = [
            { name: 'for misinformation', type: 3 },
            { name: 'your messages', type: 2 },
            { name: 'the truth', type: 1 }
        ];

        let index = 0;
        setInterval(() => {
            this.client.user.setActivity(activities[index]);
            index = (index + 1) % activities.length;
        }, 30000);
    }

    async start() {
        try {
            await this.client.login(process.env.DISCORD_TOKEN);
        } catch (error) {
            logger.error('Failed to login:', error);
            process.exit(1);
        }
    }
}

// Start the bot
const bot = new DiscordBot();
bot.start();