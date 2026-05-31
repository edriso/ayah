import { InlineKeyboard } from 'grammy';

// Callback data prefix for the timezone picker, e.g. "ayah:tz:0" (the index
// into COMMON_TIMEZONES). An index keeps the callback data short and stable.
export const TZ_PICK_PREFIX = 'ayah:tz:';

// Common timezones for the bot's Arabic-speaking audience, labelled by city in
// Arabic and mapped to their IANA name. A non-technical user does not know
// their IANA string, so they just tap a city; the free-text "/timezone
// Area/City" path stays available for anyone outside this list.
export const COMMON_TIMEZONES: ReadonlyArray<{ label: string; iana: string }> = [
  { label: 'مكة / الرياض', iana: 'Asia/Riyadh' },
  { label: 'القاهرة', iana: 'Africa/Cairo' },
  { label: 'بغداد', iana: 'Asia/Baghdad' },
  { label: 'دبي / أبوظبي', iana: 'Asia/Dubai' },
  { label: 'بيروت', iana: 'Asia/Beirut' },
  { label: 'عمّان', iana: 'Asia/Amman' },
  { label: 'الخرطوم', iana: 'Africa/Khartoum' },
  { label: 'الجزائر', iana: 'Africa/Algiers' },
  { label: 'الدار البيضاء', iana: 'Africa/Casablanca' },
];

/** Build the common-timezones keyboard, two cities per row. */
export function buildTimezoneKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  COMMON_TIMEZONES.forEach((tz, i) => {
    kb.text(tz.label, `${TZ_PICK_PREFIX}${i}`);
    if ((i + 1) % 2 === 0) kb.row();
  });
  return kb;
}
