import type { Bot, Context, InputFile } from 'grammy';
import { GrammyError } from 'grammy';
import type { Message } from 'grammy/types';
import type { SendResult } from './send';
import { logger } from './logger';

// Sending the daily ayah's recitation as an audio clip. The audio twin of the
// text send wrapper: same SendResult meaning (ok / blocked / failed) and the
// same single 429 retry, and it returns the Telegram file_id so the caller can
// cache it (see AyahAudio) and reference it on later sends instead of having
// Telegram re-fetch it from the CDN.

const MAX_RETRY_AFTER_SECONDS = 30;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface AudioSendResult {
  result: SendResult;
  /** The file_id of the sent audio, when delivered; undefined on failure. */
  fileId?: string;
}

export interface AudioSendOptions {
  /** Plain-text caption (no parse_mode). */
  caption?: string;
  /** Send without a notification sound (the ayah already notified). */
  silent?: boolean;
  /**
   * Track title hint for Telegram's in-app music player (and the lock screen /
   * Bluetooth controls). Telegram groups every audio in a chat into one
   * playlist and auto-advances through it when a clip ends - behavior the
   * sender cannot disable. Naming a clip keeps that playlist legible so an
   * auto-played neighboring ayah shows what it is instead of a mystery clip.
   *
   * Best-effort, not guaranteed: when the source file already carries ID3 tags,
   * Telegram tends to display those over the title/performer passed here. The
   * everyayah per-ayah clips DO carry ID3, so for them this mostly acts as a
   * fallback; it takes full effect for untagged files. Set it regardless - it
   * never hurts, the caption always shows, and clients/cases that honor it get
   * an Arabic, reciter-accurate label instead of the file's generic tag.
   */
  title?: string;
  /** Performer hint shown with the title (the reciter); same ID3 caveat. */
  performer?: string;
}

function audioFileId(message: Message): string | undefined {
  return message.audio?.file_id ?? message.voice?.file_id;
}

/**
 * Send one audio clip to a chat. `audio` is a URL (Telegram fetches it from the
 * CDN), a cached file_id (Telegram resends it instantly), or an InputFile (the
 * bot uploads a local file). For the daily ayah we send it silently, as a quiet
 * companion to the ayah that already notified.
 *
 * Returns the same SendResult as the text sender:
 *   'ok'      - delivered (with the file_id to cache).
 *   'blocked' - 403; the user blocked the bot.
 *   'failed'  - any other error (transient).
 * A 429 is waited out once (within the cap), like the other senders.
 */
export async function sendAudio(
  bot: Bot<Context>,
  chatId: bigint,
  audio: string | InputFile,
  opts: AudioSendOptions = {},
): Promise<AudioSendResult> {
  const other = {
    ...(opts.caption ? { caption: opts.caption } : {}),
    ...(opts.silent ? { disable_notification: true } : {}),
    ...(opts.title ? { title: opts.title } : {}),
    ...(opts.performer ? { performer: opts.performer } : {}),
  };
  const send = () => bot.api.sendAudio(Number(chatId), audio, other);
  try {
    return { result: 'ok', fileId: audioFileId(await send()) };
  } catch (err) {
    if (err instanceof GrammyError && err.error_code === 403) {
      logger.info('Subscriber has blocked the bot', { chatId: String(chatId) });
      return { result: 'blocked' };
    }
    if (err instanceof GrammyError && err.error_code === 429) {
      const retryAfter = err.parameters?.retry_after ?? 1;
      if (retryAfter <= MAX_RETRY_AFTER_SECONDS) {
        logger.warn('Rate limited, waiting then retrying once', {
          chatId: String(chatId),
          retryAfter,
        });
        await sleep(retryAfter * 1000);
        try {
          return { result: 'ok', fileId: audioFileId(await send()) };
        } catch (retryErr) {
          logger.error('Audio send failed after retry', {
            chatId: String(chatId),
            error: String(retryErr),
          });
          return { result: 'failed' };
        }
      }
    }
    logger.error('Failed to send audio', { chatId: String(chatId), error: String(err) });
    return { result: 'failed' };
  }
}
