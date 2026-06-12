// Send every tafseer edition's output for one ayah to the admin, so you can
// compare the editions and the two delivery formats in Telegram itself. Run:
//   pnpm tafseer:demo            # Ayat al-Kursi (2:255), the default sample
//   pnpm tafseer:demo 112 1      # a specific (surah, ayah)
//
// It reads the committed data files directly (no database needed) and builds
// each message with the SAME code the bot uses (formatTafseerMessages +
// tafseerLink), so what you see here is exactly what a subscriber would get.
// For each edition it sends the "text" format then the "link" format, each
// labelled, all silently. Requires BOT_TOKEN and ADMIN_TELEGRAM_ID in .env, and
// the admin must have pressed Start on the bot at least once.

import { Api } from 'grammy';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, formatTafseerMessages, tafseerLink, type TafseerFormat } from '../src/core';
import { TAFSEERS } from '../src/database/reference/tafseers';
import { SURAHS } from '../src/database/reference/surahs';
import { AYAH_COUNTS } from '../src/database/reference/ayah-counts';
import { COPY } from '../src/lib/copy';

loadEnv();

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, '..', 'prisma', 'data');

interface TafseerData {
  surahs: { number: number; ayat: string[] }[];
}

async function main() {
  const token = process.env.BOT_TOKEN?.trim();
  const adminRaw = process.env.ADMIN_TELEGRAM_ID?.trim();
  if (!token) throw new Error('BOT_TOKEN is not set in .env.');
  if (!adminRaw) throw new Error('ADMIN_TELEGRAM_ID is not set in .env (nobody to send to).');
  const chatId = Number(adminRaw);
  if (!Number.isFinite(chatId))
    throw new Error(`ADMIN_TELEGRAM_ID is not a number: "${adminRaw}".`);

  const { surah, ayah } = parseTarget();
  const surahMeta = SURAHS.find((s) => s.number === surah);
  if (!surahMeta) throw new Error(`No surah ${surah}.`);

  const api = new Api(token);
  console.log(`Sending the tafseer demo for ${surah}:${ayah} to admin ${chatId}...\n`);

  await send(api, chatId, `🧪 تجربة التفاسير — سورة ${surahMeta.nameAr}، آية ${ayah}`);

  for (const t of TAFSEERS) {
    const text = readEditionText(t.key, surah, ayah);
    const link = tafseerLink(t.linkHost, t.linkRef, surah, ayah);

    for (const format of ['text', 'link'] as TafseerFormat[]) {
      // In "text" mode an edition with no committed file produces nothing; say so
      // rather than sending a confusing blank.
      if (format === 'text' && text === null) {
        await send(api, chatId, `— ${t.nameAr} (نصًّا) — لا يوجد ملف بيانات لهذا التفسير بعد.`);
        continue;
      }
      await send(api, chatId, `── ${t.nameAr} — ${format === 'text' ? 'نصًّا' : 'رابطًا'} ──`);
      const messages = formatTafseerMessages({
        numberInSurah: ayah,
        editionLabel: t.nameAr,
        kind: t.kind,
        format,
        text,
        link,
      });
      // Mirror the real send: a tappable "read in full" button when the message
      // points to the web.
      for (const m of messages) await send(api, chatId, m.text, m.readMoreUrl);
    }
  }

  console.log('\nDone. Check the admin chat in Telegram.');
}

/** Parse the optional "surah ayah" args (default 2:255, Ayat al-Kursi). */
function parseTarget(): { surah: number; ayah: number } {
  const [s, a] = process.argv.slice(2).map((x) => Number(x));
  const surah = Number.isInteger(s) ? s : 2;
  const ayah = Number.isInteger(a) ? a : 255;
  if (surah < 1 || surah > 114) throw new Error(`Surah must be 1..114 (got ${surah}).`);
  if (ayah < 1 || ayah > AYAH_COUNTS[surah]) {
    throw new Error(`Surah ${surah} has ${AYAH_COUNTS[surah]} ayat (got ayah ${ayah}).`);
  }
  return { surah, ayah };
}

/** The committed tafseer text for (edition, surah, ayah), or null if the file is
 *  missing (that edition has not been fetched yet). */
function readEditionText(key: string, surah: number, ayah: number): string | null {
  try {
    const data = JSON.parse(
      readFileSync(join(DATA_DIR, `tafseer-${key}.json`), 'utf8'),
    ) as TafseerData;
    return data.surahs[surah - 1]?.ayat[ayah - 1] ?? null;
  } catch {
    return null;
  }
}

/** Send one plain-text message silently, like the real tafseer send — with a
 *  "read in full" button when a URL is given. */
async function send(api: Api, chatId: number, text: string, url?: string): Promise<void> {
  await api.sendMessage(chatId, text, {
    disable_notification: true,
    reply_markup: url ? { inline_keyboard: [[{ text: COPY.tafsirReadMoreBtn, url }]] } : undefined,
  });
}

main().catch((err) => {
  console.error('\ntafseer:demo failed:\n', String(err));
  process.exit(1);
});
