import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { pingCommand } from './commands/ping.js';

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) {
  throw new Error('DISCORD_TOKEN is required.');
}

if (!applicationId) {
  throw new Error('DISCORD_APPLICATION_ID is required.');
}

if (!guildId) {
  throw new Error('DISCORD_GUILD_ID is required.');
}

const commands = [pingCommand.data.toJSON()];

const rest = new REST({ version: '10' }).setToken(token);

try {
  console.info(`Registering ${commands.length} command(s) in the development server...`);

  await rest.put(
    Routes.applicationGuildCommands(applicationId, guildId),
    { body: commands },
  );

  console.info('Development commands registered successfully.');
} catch (error) {
  console.error('Failed to register development commands:', error);
  process.exitCode = 1;
}
