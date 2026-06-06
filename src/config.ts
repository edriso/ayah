import { loadEnv } from './core';

// Load the single root .env before we read any variable.
loadEnv();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalBigInt(raw: string | undefined): bigint | null {
  if (!raw) return null;
  try {
    return BigInt(raw.trim());
  } catch {
    return null;
  }
}

function parseTimezone(raw: string | undefined): string {
  const tz = raw?.trim() || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    throw new Error(
      `TZ_NAME is not a valid IANA timezone (got "${raw}"). Try "Africa/Cairo", "Europe/London", etc.`,
    );
  }
  return tz;
}

function parseAudioBaseUrl(raw: string | undefined): string {
  const url = raw?.trim() || DEFAULT_AUDIO_BASE_URL;
  if (!/^https?:\/\//i.test(url)) {
    throw new Error(
      `AUDIO_BASE_URL must be an http(s) URL (got "${raw}"). ` +
        `It is the CDN root that holds per-reciter folders, e.g. "${DEFAULT_AUDIO_BASE_URL}".`,
    );
  }
  return url.replace(/\/+$/, '');
}

// The recitation audio CDN root. Per-reciter folders + zero-padded surah/ayah
// hang off it (see src/core/audio.ts and src/database/reference/reciters.ts).
const DEFAULT_AUDIO_BASE_URL = 'https://everyayah.com/data';

export const config = Object.freeze({
  // REQUIRED. Bot token from @BotFather.
  botToken: requireEnv('BOT_TOKEN').trim(),
  // Default timezone for brand-new subscribers. Each one can change theirs.
  defaultTimezone: parseTimezone(process.env.TZ_NAME),
  // Optional. If unset, the /admin_* commands authorise nobody.
  adminTelegramId: optionalBigInt(process.env.ADMIN_TELEGRAM_ID),
  // CDN root for the daily ayah's recitation audio. Override only to self-host
  // or point at another mirror; the per-reciter folders must match.
  audioBaseUrl: parseAudioBaseUrl(process.env.AUDIO_BASE_URL),
  isDev: process.env.NODE_ENV !== 'production',
});
