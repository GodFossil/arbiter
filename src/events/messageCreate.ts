import { Events, type Client, type Message } from 'discord.js';
import { reply, type ContextMessage } from '../lib/ai.js';

const CONTEXT_LIMIT = 10;
const DISCORD_MAX_LENGTH = 2000;

/**
 * Determines whether Arbiter should respond to this message.
 * Arbiter responds when directly mentioned or when a user replies
 * to one of Arbiter's own messages.
 */
function shouldRespond(message: Message, clientId: string): boolean {
  if (message.author.bot) return false;
  if (!message.inGuild()) return false;

  const mentioned = message.mentions.users.has(clientId);
  const replyToArbiter =
    message.reference?.messageId !== undefined &&
    message.mentions.repliedUser?.id === clientId;

  return mentioned || replyToArbiter;
}

/**
 * Fetches recent channel history and shapes it into context messages
 * for the AI adapter, oldest first, excluding the triggering message.
 */
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

/**
 * Sends a reply, splitting across multiple messages if the response
 * exceeds Discord's 2000-character limit.
 */
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

/**
 * Registers the messageCreate event handler on the Discord client.
 */
export function registerMessageCreate(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    const clientId = client.user?.id;
    if (!clientId) return;

    if (!shouldRespond(message, clientId)) return;

    try {
      const context = await buildContext(message, clientId);
      const prompt = message.content;
      const response = await reply(context, prompt);
      await sendReply(message, response);
    } catch (error) {
      console.error('Failed to handle message:', error);
    }
  });
}
