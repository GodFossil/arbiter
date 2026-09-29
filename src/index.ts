import 'dotenv/config';
import { createServer } from 'node:http';
import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
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

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be a valid TCP port.');
}

createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/') {
    response.writeHead(302, { location: 'https://stats.uptimerobot.com/RVdfyvKTe4' });
    response.end();
    return;
  }

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
  console.info(`Arbiter is online as ${readyClient.user.tag}.`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

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

registerMessageCreate(client);

await client.login(token);
