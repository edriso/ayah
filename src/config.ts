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

export const config = Object.freeze({
  // REQUIRED. Bot token from @BotFather.
  botToken: requireEnv('BOT_TOKEN').trim(),
  // Default timezone for brand-new subscribers. Each one can change theirs.
  defaultTimezone: parseTimezone(process.env.TZ_NAME),
  // Optional. If unset, the /admin_* commands authorise nobody.
  adminTelegramId: optionalBigInt(process.env.ADMIN_TELEGRAM_ID),
  isDev: process.env.NODE_ENV !== 'production',
});
