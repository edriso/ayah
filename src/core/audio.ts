// Build the URL for one ayah's recitation audio. Pure string work so it is easy
// to test, with no network or database.
//
// The audio is per-ayah MP3 hosted on a CDN, named by zero-padded surah+ayah —
// the everyayah.com / quran.com convention, e.g. .../Husary_128kbps/002027.mp3
// is surah 2, ayah 27. We never store the audio in this repo (one reciter for
// the whole Quran is ~1 GB); the bot fetches it from this URL the first time an
// ayah is sent and then reuses Telegram's file_id (see the AyahAudio cache).

/** Zero-pad a surah/ayah number to the 3-digit form the CDN file names use. */
function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

/**
 * The recitation audio URL for one ayah, from a reciter's folder on the audio
 * CDN: `${baseUrl}/${folder}/${surah3}${ayah3}.mp3`. Throws on an out-of-range
 * surah/ayah or an empty base/folder, so a bad value can never form a wrong or
 * empty URL. `baseUrl` is the configured CDN root (config.audioBaseUrl), with
 * any trailing slash ignored.
 */
export function ayahAudioUrl(baseUrl: string, folder: string, surah: number, ayah: number): string {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
    throw new Error(`ayahAudioUrl: surah must be 1..114, got ${surah}`);
  }
  if (!Number.isInteger(ayah) || ayah < 1) {
    throw new Error(`ayahAudioUrl: ayah must be >= 1, got ${ayah}`);
  }
  const base = baseUrl.trim().replace(/\/+$/, '');
  const dir = folder.trim().replace(/^\/+|\/+$/g, '');
  if (base === '' || dir === '') {
    throw new Error('ayahAudioUrl: baseUrl and folder must both be non-empty');
  }
  return `${base}/${dir}/${pad3(surah)}${pad3(ayah)}.mp3`;
}
