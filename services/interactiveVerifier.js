const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const sourceVerifier = require('./sourceVerifier');
const contentFetcher = require('./contentFetcher');
const cacheManager = require('./cacheManager');
const logger = require('./logger');

class InteractiveVerifier {
    constructor() {
        this.pendingVerifications = new Map();
    }

    async handleInteraction(interaction) {
        try {
            if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
            
            await interaction.deferUpdate();

            const { customId } = interaction;
            
            switch (customId) {
                case 'verify_sources':
                    await this.handleVerifySources(interaction);
                    break;
                case 'more_info':
                    await this.handleMoreInfo(interaction);
                    break;
                case 'source_select':
                    await this.handleSourceSelect(interaction);
                    break;
                case 'refresh_verification':
                    await this.handleRefreshVerification(interaction);
                    break;
            }
        } catch (error) {
            logger.error('Error handling interaction:', error);
            await interaction.followUp({ 
                content: 'An error occurred while processing your request.', 
                ephemeral: true 
            });
        }
    }

    async handleVerifySources(interaction) {
        const message = interaction.message;
        const embed = message.embeds[0];
        
        // Extract claims from the embed
        const claims = this.extractClaimsFromEmbed(embed);
        if (!claims.length) {
            await interaction.followUp({ 
                content: 'No claims found to verify sources for.', 
                ephemeral: true 
            });
            return;
        }

        // Create source selection menu
        const sources = this.extractSourcesFromClaims(claims);
        if (!sources.length) {
            await interaction.followUp({ 
                content: 'No sources available to verify.', 
                ephemeral: true 
            });
            return;
        }

        const selectMenu = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('source_select')
                    .setLabel('Select Source to Verify')
                    .setStyle(ButtonStyle.Primary)
            );

        // Create source verification embed
        const verificationEmbed = new EmbedBuilder()
            .setTitle('📋 Source Verification')
            .setDescription('Select a source to see detailed verification:');

        sources.forEach((source, index) => {
            verificationEmbed.addFields({
                name: `${index + 1}. ${source.title}`,
                value: [
                    `**URL:** ${source.url}`,
                    `**Reliability:** ${source.reliability || 'Unknown'}`,
                    `**Confidence:** ${source.confidence || 'N/A'}`
                ].join('\n'),
                inline: false
            });
        });

        await interaction.followUp({ 
            embeds: [verificationEmbed], 
            components: [selectMenu], 
            ephemeral: true 
        });
    }

    async handleMoreInfo(interaction) {
        const message = interaction.message;
        const embed = message.embeds[0];
        
        // Create detailed information embed
        const detailedEmbed = new EmbedBuilder()
            .setTitle('ℹ️ Detailed Information')
            .setDescription('Here are more details about the fact-check results:')
            .setColor(0x0099ff)
            .addFields(
                { name: 'How I Work', value: [
                    '1. Extract factual claims from your message',
                    '2. Search for relevant sources',
                    '3. Verify source reliability',
                    '4. Analyze evidence and provide verdict',
                    '5. Calculate confidence score'
                ].join('\n') },
                { name: 'Confidence Levels', value: [
                    '• **High (80-100%):** Strong evidence from reliable sources',
                    '• **Medium (50-79%):** Some evidence or mixed sources',
                    '• **Low (0-49%):** Limited evidence or unreliable sources'
                ].join('\n') },
                { name: 'Verdict Types', value: [
                    '• **True:** Supported by evidence',
                    '• **False:** Contradicted by evidence',
                    '• **Partially True:** Mix of true and false elements',
                    '• **Misleading:** Technically true but misleading',
                    '• **Unverifiable:** Not enough evidence'
                ].join('\n') }
            );

        await interaction.followUp({ 
            embeds: [detailedEmbed], 
            ephemeral: true 
        });
    }

    async handleSourceSelect(interaction) {
        const selectedSource = this.getSelectedSource(interaction);
        if (!selectedSource) {
            await interaction.followUp({ 
                content: 'Could not find the selected source.', 
                ephemeral: true 
            });
            return;
        }

        // Verify the selected source
        const verification = await sourceVerifier.verify(selectedSource);
        const detailedVerification = await sourceVerifier.getDetailedAnalysis(selectedSource.url);

        const embed = new EmbedBuilder()
            .setTitle(`🔗 Source Verification: ${verification.title}`)
            .setURL(verification.url)
            .setColor(this.getReliabilityColor(verification.reliability))
            .setDescription(detailedVerification.summary || verification.snippet)
            .addFields(
                { name: 'Reliability', value: verification.reliability || 'Unknown', inline: true },
                { name: 'Authority', value: detailedVerification.authority || 'Unknown', inline: true },
                { name: 'Bias', value: detailedVerification.bias || 'Unknown', inline: true },
                { name: 'Last Updated', value: verification.lastUpdated || 'Unknown', inline: true },
                { name: 'Contact Info', value: detailedVerification.contact || 'Not available', inline: true }
            );

        if (detailedVerification.recommendations) {
            embed.addFields({
                name: 'Recommendations',
                value: detailedVerification.recommendations.join('\n')
            });
        }

        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('refresh_verification')
                    .setLabel('Refresh')
                    .setStyle(ButtonStyle.Secondary)
            );

        await interaction.followUp({ 
            embeds: [embed], 
            components: [actionRow], 
            ephemeral: true 
        });
    }

    async handleRefreshVerification(interaction) {
        // Clear cache and refresh verification
        const url = interaction.message.embeds[0].url;
        if (url) {
            const cacheKey = `source:${Buffer.from(url).toString('base64')}`;
            cacheManager.delete(cacheKey);
            
            await interaction.followUp({ 
                content: 'Verification refreshed. Please run the source verification again.', 
                ephemeral: true 
            });
        }
    }

    extractClaimsFromEmbed(embed) {
        const claims = [];
        embed.fields.forEach(field => {
            if (field.name.startsWith('Claim')) {
                const claimText = field.name.replace(/^Claim \d+:\s*/, '');
                claims.push({ claim: claimText, field });
            }
        });
        return claims;
    }

    extractSourcesFromClaims(claims) {
        const sources = [];
        claims.forEach(claim => {
            if (claim.sources) {
                sources.push(...claim.sources);
            }
        });
        return [...new Set(sources.map(s => s.url))].map(url => 
            sources.find(s => s.url === url)
        );
    }

    getSelectedSource(interaction) {
        // This would need to be implemented based on your actual source selection mechanism
        // For now, returning a mock source
        return {
            url: 'https://example.com',
            title: 'Example Source'
        };
    }

    getReliabilityColor(reliability) {
        switch (reliability) {
            case 'high': return 0x00ff00;
            case 'medium': return 0xffff00;
            case 'low': return 0xff0000;
            default: return 0x808080;
        }
    }
}

module.exports = new InteractiveVerifier();