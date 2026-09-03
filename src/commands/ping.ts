import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from 'discord.js';

export const pingCommand = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether Arbiter is responding.'),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const latency = interaction.client.ws.ping;

    if (latency < 0) {
      await interaction.reply('Pong! Gateway latency is still being measured.');
      return;
    }

    await interaction.reply(`Pong! Gateway latency: ${latency}ms`);
  },
};