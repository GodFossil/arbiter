import 'dotenv/config';
import { createServer } from 'node:http';
import {
  Client,
  Events,
  GatewayIntentBits,
  type ChatInputCommandInteraction,
  type InteractionReplyOptions,
} from 'discord.js';
import { pingCommand } from './commands/ping.js';
import { registerMessageCreate } from './events/messageCreate.js';

const token = process.env.DISCORD_TOKEN;

if (!token) {
  throw new Error('DISCORD_TOKEN is required.');
}

const commands = new Map([
  [pingCommand.data.name, pingCommand],
]);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const port = Number(process.env.PORT) || 3000;

createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  response.writeHead(404);
  response.end();
}).listen(port, '0.0.0.0', () => {
  console.info(`Health server listening on port ${port}`);
});

client.once(Events.ClientReady, (readyClient) => {
  console.info(`Ready! Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction as ChatInputCommandInteraction);
  } catch (error) {
    console.error(`Failed to execute /${interaction.commandName}:`, error);

    const reply: InteractionReplyOptions = {
      content: 'There was an error while executing this command.',
      ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

client.on(Events.Error, (error) => {
  console.error('Discord client error:', error);
});

registerMessageCreate(client);

await client.login(token);
