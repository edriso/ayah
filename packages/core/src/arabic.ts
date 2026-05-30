// Arabic-Indic digit helpers. Ayah numbers shown next to Quran text look
// right only in Arabic-Indic digits (٠١٢٣...), not Western ones (0123...).

const ARABIC_INDIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

/** Convert a non-negative integer to Arabic-Indic digits, e.g. 25 -> "٢٥". */
export function toArabicDigits(value: number): string {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`toArabicDigits expects a non-negative integer, got ${value}`);
  }
  return String(value)
    .split('')
    .map((d) => ARABIC_INDIC[Number(d)])
    .join('');
}

/**
 * Turn any Arabic-Indic (٠-٩) or Persian (۰-۹) digits in a string into plain
 * ASCII digits (0-9), leaving everything else untouched. The bot shows times
 * and counts in Arabic-Indic digits, so a user on an Arabic keyboard will
 * naturally TYPE them back. We normalise input through this before parsing so
 * "/time ٠٧:٠٠" and "/review ٥" work just like the ASCII forms.
 */
export function toAsciiDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.codePointAt(0) as number;
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660); // Arabic-Indic
    return String(code - 0x06f0); // Persian
  });
}
