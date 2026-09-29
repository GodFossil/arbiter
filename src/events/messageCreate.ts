import { Events, type Client, type Message } from 'discord.js';
import { reply, type ContextMessage } from '../lib/ai.js';

const CONTEXT_LIMIT = 10;
const DISCORD_MAX_LENGTH = 2000;
const allowedGuildId = process.env.DISCORD_GUILD_ID;
const allowedChannelId = process.env.DISCORD_ALLOWED_CHANNEL_ID;

if (!allowedGuildId) throw new Error('DISCORD_GUILD_ID is required.');
if (!allowedChannelId) throw new Error('DISCORD_ALLOWED_CHANNEL_ID is required.');

function isAllowed(message: Message): boolean {
  return message.guildId === allowedGuildId && message.channelId === allowedChannelId;
}

function shouldRespond(message: Message, clientId: string): boolean {
  if (message.author.bot) return false;
  if (!message.inGuild()) return false;
  if (!isAllowed(message)) return false;

  const mentioned = message.mentions.users.has(clientId);
  const replyToArbiter =
    message.reference?.messageId !== undefined &&
    message.mentions.repliedUser?.id === clientId;

  return mentioned || replyToArbiter;
}

async function buildContext(
  message: Message,
  clientId: string,
): Promise<ContextMessage[]> {
  const fetched = await message.channel.messages.fetch({
    limit: CONTEXT_LIMIT,
    before: message.id,
  });

  return fetched
    .reverse()
    .map((msg): ContextMessage => ({
      role: msg.author.id === clientId ? 'assistant' : 'user',
      name: msg.author.username,
      content: msg.content,
    }))
    .filter((msg) => msg.content.length > 0);
}

async function sendReply(message: Message, text: string): Promise<void> {
  if (text.length <= DISCORD_MAX_LENGTH) {
    await message.reply(text);
    return;
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    chunks.push(remaining.slice(0, DISCORD_MAX_LENGTH));
    remaining = remaining.slice(DISCORD_MAX_LENGTH);
  }

  await message.reply(chunks[0]!);
  for (const chunk of chunks.slice(1)) {
    await message.channel.send(chunk);
  }
}

export function registerMessageCreate(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    const clientId = client.user?.id;
    if (!clientId || !shouldRespond(message, clientId)) return;

    try {
      const context = await buildContext(message, clientId);
      const response = await reply(context, message.content);
      await sendReply(message, response);
    } catch (error) {
      console.error('Failed to handle message:', error);
    }
  });
}
