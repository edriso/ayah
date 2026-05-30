import type { Bot } from 'grammy';
import { GrammyError, type Context } from 'grammy';
import { logger } from './logger';

export type SendResult = 'ok' | 'blocked' | 'failed';

/**
 * Send one plain-text message to a chat. No parse_mode on purpose: Quran
 * text contains characters Markdown/HTML parsing would reject with a 400,
 * so plain text is the only safe choice (same lesson as the zaaduna bot).
 *
 * Returns:
 *   'ok'      - delivered.
 *   'blocked' - the user blocked the bot or deleted the chat (403). The
 *               caller should mark them blocked so we stop trying.
 *   'failed'  - any other error (transient). The caller does not advance
 *               the subscriber, so the same ayah is retried next time.
 */
export async function sendMessage(
  bot: Bot<Context>,
  chatId: bigint,
  text: string,
): Promise<SendResult> {
  try {
    await bot.api.sendMessage(Number(chatId), text);
    return 'ok';
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 403) {
      logger.info('Subscriber has blocked the bot', { chatId: String(chatId) });
      return 'blocked';
    }
    logger.error('Failed to send message', { chatId: String(chatId), error: String(err) });
    return 'failed';
  }
}
