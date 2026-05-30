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
