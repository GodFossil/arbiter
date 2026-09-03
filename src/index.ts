import 'dotenv/config';
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  type InteractionReplyOptions,
} from 'discord.js';
import { pingCommand } from './commands/ping.js';

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  throw new Error('DISCORD_BOT_TOKEN is required.');
}

const commands = new Map([
  [pingCommand.data.name, pingCommand],
]);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, (readyClient) => {
  console.info(`Arbiter is online as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  const command = commands.get(interaction.commandName);

  if (!command) {
    console.error(`No handler exists for /${interaction.commandName}.`);
    return;
  }

  try {
    await command.execute(interaction);
  
  } catch (error) {
    console.error(`Failed to execute /${interaction.commandName}:`, error);

    const errorMessage: InteractionReplyOptions = {
      content: 'Arbiter encountered an error while running that command.',
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(errorMessage);
    } else {
      await interaction.reply(errorMessage);
    }
  }
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

await client.login(token);