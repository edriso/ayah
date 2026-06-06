import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GrammyError } from 'grammy';

vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { sendAudio } from './send-audio';

// A fake bot whose api.sendAudio we drive per test. Returns the api mock too,
// so tests can assert on the call. The bot is cast to the grammy Bot type only
// where sendAudio needs it.
function fakeBot(sendAudioImpl: (...args: unknown[]) => unknown) {
  const sendAudioMock = vi.fn(sendAudioImpl);
  const bot = { api: { sendAudio: sendAudioMock } } as never;
  return { bot, sendAudioMock };
}

/** Build a GrammyError with a given error_code (and optional retry_after). */
function grammyError(code: number, retryAfter?: number): GrammyError {
  return new GrammyError(
    'Call to sendAudio failed',
    {
      ok: false,
      error_code: code,
      description: 'x',
      ...(retryAfter !== undefined ? { parameters: { retry_after: retryAfter } } : {}),
    },
    'sendAudio',
    {},
  );
}

beforeEach(() => vi.clearAllMocks());

describe('sendAudio', () => {
  it('returns ok with the audio file_id on success', async () => {
    const { bot } = fakeBot(() => ({ audio: { file_id: 'AUDIO_ID' } }));
    const res = await sendAudio(bot, 123n, 'https://x/1.mp3');
    expect(res).toEqual({ result: 'ok', fileId: 'AUDIO_ID' });
  });

  it('falls back to the voice file_id when the message is a voice note', async () => {
    const { bot } = fakeBot(() => ({ voice: { file_id: 'VOICE_ID' } }));
    const res = await sendAudio(bot, 123n, 'https://x/1.mp3');
    expect(res).toEqual({ result: 'ok', fileId: 'VOICE_ID' });
  });

  it('passes the caption and disable_notification when silent', async () => {
    const { bot, sendAudioMock } = fakeBot(() => ({ audio: { file_id: 'A' } }));
    await sendAudio(bot, 123n, 'https://x/1.mp3', { caption: '🎧 ...', silent: true });
    expect(sendAudioMock).toHaveBeenCalledWith(123, 'https://x/1.mp3', {
      caption: '🎧 ...',
      disable_notification: true,
    });
  });

  it('omits options when neither caption nor silent is given', async () => {
    const { bot, sendAudioMock } = fakeBot(() => ({ audio: { file_id: 'A' } }));
    await sendAudio(bot, 123n, 'https://x/1.mp3');
    expect(sendAudioMock).toHaveBeenCalledWith(123, 'https://x/1.mp3', {});
  });

  it('reports a 403 as blocked', async () => {
    const { bot } = fakeBot(() => {
      throw grammyError(403);
    });
    expect(await sendAudio(bot, 123n, 'https://x/1.mp3')).toEqual({ result: 'blocked' });
  });

  it('reports any other error as failed', async () => {
    const { bot } = fakeBot(() => {
      throw new Error('network');
    });
    expect(await sendAudio(bot, 123n, 'https://x/1.mp3')).toEqual({ result: 'failed' });
  });

  it('waits out a 429 and retries once, succeeding on the retry', async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const { bot, sendAudioMock } = fakeBot(() => {
        calls++;
        if (calls === 1) throw grammyError(429, 1);
        return { audio: { file_id: 'AFTER_RETRY' } };
      });
      const promise = sendAudio(bot, 123n, 'https://x/1.mp3');
      await vi.advanceTimersByTimeAsync(1000); // the retry_after wait
      expect(await promise).toEqual({ result: 'ok', fileId: 'AFTER_RETRY' });
      expect(sendAudioMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('gives up (failed) when a 429 asks to wait longer than the cap', async () => {
    const { bot, sendAudioMock } = fakeBot(() => {
      throw grammyError(429, 9999); // beyond the 30s cap
    });
    expect(await sendAudio(bot, 123n, 'https://x/1.mp3')).toEqual({ result: 'failed' });
    expect(sendAudioMock).toHaveBeenCalledTimes(1); // never retried
  });
});
