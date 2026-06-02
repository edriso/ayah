// All the Arabic text the bot shows. Kept in one file so wording is easy to
// review and change without touching logic. Numbers shown to users are in
// Arabic-Indic digits to match the Quran text.
//
// Bidi note: this text is right-to-left, but commands, clock times and
// timezone names are left-to-right. When a left-to-right run sits in the
// middle of Arabic, the punctuation around it can render in the wrong order
// (a known bidi problem). The ltr() helper below wraps such a run in Unicode
// isolate characters so it always renders correctly. A lone command at the
// very end of a line is fine without it, so we only wrap the tricky cases
// (examples, formats, timezone names).

import { isDayActive, activeDaysList, toArabicDigits, ALL_DAYS } from '../core';

// Unicode isolate characters: First Strong Isolate (U+2066) ... Pop
// Directional Isolate (U+2069). The standard recommends these (over the older
// embedding marks) for dropping a left-to-right run into right-to-left text.
// Built from code points because the characters themselves are invisible.
const FIRST_STRONG_ISOLATE = String.fromCodePoint(0x2066);
const POP_DIRECTIONAL_ISOLATE = String.fromCodePoint(0x2069);

/** Wrap a left-to-right run (a command, a time, a timezone) so it renders
 *  correctly inside right-to-left Arabic text. */
export function ltr(run: string): string {
  return `${FIRST_STRONG_ISOLATE}${run}${POP_DIRECTIONAL_ISOLATE}`;
}

/** Arabic names for ISO weekdays (1 = Monday ... 7 = Sunday). */
const DAY_NAMES_AR: Record<number, string> = {
  1: 'الإثنين',
  2: 'الثلاثاء',
  3: 'الأربعاء',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
  7: 'الأحد',
};

// The weekdays in the order Arabic speakers expect to read them: Saturday
// first, Friday last. The values are ISO weekday numbers (Monday = 1 ...
// Sunday = 7) so they still match the bitmask helpers in core; only the
// display order is different. Both the day picker and the settings summary
// use this so the two always agree.
export const WEEKDAY_DISPLAY_ORDER: readonly number[] = [6, 7, 1, 2, 3, 4, 5];

export function dayNameAr(isoWeekday: number): string {
  return DAY_NAMES_AR[isoWeekday] ?? String(isoWeekday);
}

/** "07:00" style clock, with Arabic-Indic digits. */
export function formatTimeAr(hour: number, minute: number): string {
  const h = toArabicDigits(hour).padStart(2, '٠');
  const m = toArabicDigits(minute).padStart(2, '٠');
  return `${h}:${m}`;
}

/** A friendly list of the active days (Saturday first), or "every day" when
 *  all are on. */
export function daysSummaryAr(mask: number): string {
  if (mask === ALL_DAYS) return 'كل الأيام';
  const days = WEEKDAY_DISPLAY_ORDER.filter((iso) => isDayActive(mask, iso));
  if (days.length === 0) return 'لا يوجد (لن تصلك آيات)';
  return days.map(dayNameAr).join('، ');
}

/**
 * Describe the review count for the settings view, with correct Arabic
 * number-noun agreement (singular for 1, dual for 2, plural for 3-10,
 * singular again for 11+).
 */
export function reviewSummaryAr(reviewCount: number): string {
  if (reviewCount === 0) return 'بدون مراجعة (آية اليوم فقط)';
  if (reviewCount === 1) return 'آية سابقة واحدة';
  if (reviewCount === 2) return 'آيتان سابقتان';
  if (reviewCount <= 10) return `${toArabicDigits(reviewCount)} آيات سابقة`;
  return `${toArabicDigits(reviewCount)} آية سابقة`;
}

/** Short Arabic label for an order (track key), used in settings and buttons. */
const ORDER_LABEL_AR: Record<string, string> = {
  'kids-hifz': 'منهج الحفظ (من الناس)',
  mushaf: 'ترتيب المصحف (من الفاتحة)',
};

export function orderSummaryAr(orderKey: string): string {
  return ORDER_LABEL_AR[orderKey] ?? orderKey;
}

/** "سورة الملك، آية ٥": where the subscriber stands (or starts) now. */
export function positionSummaryAr(surahNameAr: string, numberInSurah: number): string {
  return `سورة ${surahNameAr}، آية ${toArabicDigits(numberInSurah)}`;
}

export interface SettingsView {
  deliveryHour: number;
  deliveryMinute: number;
  activeDays: number;
  reviewCount: number;
  timezone: string;
  pausedAt: Date | null;
  // Where the subscriber stands now and in which order. Optional so pure
  // tests (and any caller without the joined entry) can omit them; when
  // absent the two lines are simply left out.
  position?: { surahNameAr: string; numberInSurah: number };
  orderKey?: string;
}

export function settingsSummary(s: SettingsView): string {
  // The status reflects what will ACTUALLY happen: a break, or no chosen days,
  // both mean no ayat arrive. We do not show "working" when nothing will come.
  let status: string;
  if (s.pausedAt) status = 'في وضع الراحة ⏸️';
  else if (activeDaysList(s.activeDays).length === 0) status = 'لن تصلك آيات (لم تختر أي يوم) ⚠️';
  else status = 'يعمل ✅';

  const lines = [
    'إعداداتك الحالية:',
    `• الحالة: ${status}`,
    `• وقت الإرسال: ${formatTimeAr(s.deliveryHour, s.deliveryMinute)}`,
    `• الأيام: ${daysSummaryAr(s.activeDays)}`,
    `• المراجعة: ${reviewSummaryAr(s.reviewCount)}`,
    `• المنطقة الزمنية: ${ltr(s.timezone)}`,
  ];
  if (s.position) {
    lines.push(`• الموضع: ${positionSummaryAr(s.position.surahNameAr, s.position.numberInSurah)}`);
  }
  if (s.orderKey) lines.push(`• الترتيب: ${orderSummaryAr(s.orderKey)}`);
  return lines.join('\n');
}

export const COPY = {
  // Shown to a returning user (one who has already started). The starting
  // point is no longer hard-coded here; it is a choice shown in /settings.
  // Each command sits at the end of its own line so it stays tappable and
  // renders cleanly in the right-to-left text.
  welcome: (settings: string) =>
    [
      'السلام عليكم ورحمة الله 🌿',
      '',
      'مرحبًا بعودتك إلى بوت "آية". تصلك آية واحدة كل يوم بإذن الله، مع آيات سابقة من السورة نفسها للمراجعة.',
      '',
      '👈 لرؤية آيتك الآن اضغط /today',
      '',
      settings,
      '',
      'لتغيير سورة البداية: /surah',
      'لتغيير الترتيب: /order',
      'لعرض كل الأوامر: /help',
    ].join('\n'),

  // Shown to a brand-new user, paired with the onboarding keyboard
  // (start-from-An-Nas / pick a surah / switch to Mushaf order).
  welcomeNew: [
    'السلام عليكم ورحمة الله 🌿',
    '',
    'مرحبًا بك في بوت "آية". يساعدك على حفظ القرآن بإرسال آية واحدة كل يوم، مع آيات سابقة من السورة نفسها للمراجعة.',
    '',
    'من أين تحب أن تبدأ؟ يمكنك البدء بالمنهج الافتراضي (من سورة الناس)، أو اختيار سورة تبدأ بها، أو الحفظ بترتيب المصحف (من الفاتحة).',
    '',
    'يمكنك تغيير كل ذلك لاحقًا في أي وقت.',
  ].join('\n'),

  // Command first on each line (so it stays tappable), then a colon and the
  // Arabic description. Examples that carry extra latin (a time, a timezone,
  // an argument) are wrapped with ltr() so they do not garble.
  help: [
    'بوت "آية" يساعدك على حفظ القرآن بإرسال آية واحدة كل يوم مع آيات سابقة للمراجعة.',
    '',
    'الأوامر:',
    '/today: عرض آية اليوم الآن (تُحتسب آيتك لهذا اليوم)',
    `/surah: اختيار سورة البداية، أو اكتب رقم السورة والآية مثل ${ltr('/surah 67 5')}`,
    '/order: اختيار الترتيب (منهج الحفظ من الناس، أو ترتيب المصحف من الفاتحة)',
    `/time: ضبط وقت الإرسال، مثل ${ltr('/time 07:00')}`,
    '/days: اختيار أيام الإرسال',
    `/review: عدد آيات المراجعة من ٠ إلى ٢٠، مثل ${ltr('/review 5')}`,
    `/timezone: ضبط المنطقة الزمنية، مثل ${ltr('/timezone Africa/Cairo')}`,
    '/pause: أخذ راحة أو العودة منها (يبقى موضعك محفوظًا)',
    '/settings: عرض إعداداتك الحالية',
  ].join('\n'),

  // Onboarding keyboard button labels.
  startDefaultBtn: 'ابدأ من سورة الناس (الافتراضي)',
  pickSurahBtn: '📖 اختر سورة البداية',
  mushafOrderBtn: '🔀 ترتيب المصحف (من الفاتحة)',

  // Surah / start-point copy. The example with an ayah number is on its own
  // line and wrapped with ltr() so it reads left-to-right.
  surahPrompt:
    'اختر السورة التي تريد أن تبدأ بها الحفظ.\n' +
    `أو اكتب رقم السورة (والآية إن أردت)، مثل ${ltr('/surah 67 5')}`,
  surahInvalid:
    'تعذّر فهم ذلك. اكتب رقم السورة من ١ إلى ١١٤، ويمكنك إضافة رقم الآية بعده.\n' +
    `مثل ${ltr('/surah 67 5')}`,
  // After a reposition on a free day: the chosen ayah counts as today's, and
  // the position has advanced past it (so /settings shows the NEXT ayah).
  repositionClaimed: (surahNameAr: string, numberInSurah: number) =>
    `موضعك الآن ${positionSummaryAr(surahNameAr, numberInSurah)}، وهذه آية اليوم 🌿\nوالتالية تصلك في موعدك المحدد بإذن الله.`,
  // After a reposition when today is already delivered, an off day, or paused:
  // the ayah is shown as a preview and will arrive at the next scheduled time.
  repositionPreview: (surahNameAr: string, numberInSurah: number) =>
    `موضعك الآن ${positionSummaryAr(surahNameAr, numberInSurah)} ✅\nوستصلك في موعدك المحدد بإذن الله.`,

  // Order copy.
  orderPrompt: 'اختر ترتيب الحفظ:',
  orderUnchanged: (orderKey: string) => `أنت تتبع ${orderSummaryAr(orderKey)} بالفعل ✅`,
  orderSet: (orderKey: string) => `تم ضبط الترتيب على ${orderSummaryAr(orderKey)} ✅`,

  // Settings keyboard button labels.
  pauseBtn: '⏸️ أخذ راحة',
  resumeBtn: '▶️ العودة من الراحة',
  settingsSurahBtn: '📖 سورة البداية',

  brokenOrNotStarted: 'لم نتمكن من تجهيز آية لك الآن، حاول لاحقًا بإذن الله.',

  // Shown above the ayah when /today re-shows an ayah already delivered today.
  todayAlready: 'لقد وصلتك آية اليوم بالفعل، وهذه هي 🌿',

  // The command sits at the end of its line so it stays tappable and the
  // right-to-left text does not reorder around it.
  paused: 'تم إيقاف الإرسال مؤقتًا، وسيبقى موضعك محفوظًا 🌿\nوعندما تريد العودة اكتب /pause',
  alreadyPaused: 'أنت في وضع الراحة بالفعل. للعودة اكتب /pause',
  resumed: 'أهلًا بعودتك 🌿 سنكمل من حيث توقفت بإذن الله.',
  alreadyActive: 'أنت لست في وضع الراحة. الإرسال يعمل بالفعل ✅',
  pausedHint: 'تذكير: أنت في وضع الراحة الآن، فلن تصلك الآيات تلقائيًا.\nللعودة اكتب /pause',

  // The clock format and examples are wrapped with ltr() and put on their own
  // line, so the latin parts never reorder inside the Arabic sentence.
  timePrompt:
    'اختر وقت الإرسال من الأزرار، أو اكتبه بنفسك بهذه الصيغة (٢٤ ساعة):\n' +
    `${ltr('/time HH:MM')}\n` +
    `مثل ${ltr('/time 07:00')}`,
  timeInvalid: `صيغة الوقت غير صحيحة. اكتب الوقت بنظام ٢٤ ساعة، مثل ${ltr('/time 07:00')}`,
  timeUpdated: (t: string, tz: string) =>
    `تم ضبط وقت الإرسال على ${ltr(t)} حسب منطقتك (${ltr(tz)}) ✅\n` +
    'إن لم تكن منطقتك صحيحة فاضبطها عبر /timezone',

  tzPrompt:
    'اختر منطقتك الزمنية من المدن التالية، أو اكتبها بنفسك بهذه الصيغة:\n' +
    `${ltr('/timezone Area/City')}\n` +
    `مثل ${ltr('/timezone Africa/Cairo')}`,
  tzInvalid: `اسم المنطقة الزمنية غير صحيح. مثال صحيح: ${ltr('Africa/Cairo')}`,
  tzUpdated: (tz: string) => `تم ضبط المنطقة الزمنية على ${ltr(tz)} ✅`,

  daysPrompt: 'اختر الأيام التي تريد أن تصلك فيها الآيات، ثم اضغط "تم":',
  daysUpdated: (summary: string) => `تم تحديث أيام الإرسال: ${summary} ✅`,
  daysNone: 'لم تختر أي يوم، لن تصلك آيات. اختر يومًا واحدًا على الأقل، أو خذ راحة عبر /pause',

  reviewUsage: (current: number) =>
    [
      `عدد آيات المراجعة الحالي: ${reviewSummaryAr(current)}.`,
      `لتغييره اكتب رقمًا من ٠ إلى ٢٠، مثل ${ltr('/review 5')}`,
      `واكتب ${ltr('/review 0')} لإيقاف المراجعة والاكتفاء بآية اليوم.`,
    ].join('\n'),
  reviewInvalid: `الرجاء كتابة رقم صحيح من ٠ إلى ٢٠، مثل ${ltr('/review 5')}`,
  reviewUpdated: (count: number) =>
    count === 0
      ? 'تم إيقاف المراجعة. ستصلك آية اليوم فقط ✅'
      : `تم ضبط المراجعة على ${reviewSummaryAr(count)} ✅`,

  // The bot's About (short description, ≤120 chars) and Description (≤512
  // chars), set on startup via the Bot API so the profile and empty-chat start
  // screen describe the bot without a manual @BotFather step. Mirrors the doc
  // text in docs/BOTFATHER.md (## About / ## Description); keep them in sync.
  botAbout:
    'احفظ القرآن آيةً آية 🌿 تصلك آية كل يوم مع آيات للمراجعة، في الوقت والأيام التي تختارها. اضغط Start للبدء.',
  botDescription: [
    'السلام عليكم ورحمة الله 🌿',
    'بوت "آية" يعينك على حفظ القرآن الكريم بخطوات صغيرة ثابتة:',
    '• تصلك كل يوم آية جديدة للحفظ، ومعها آيات سابقة من نفس السورة للمراجعة.',
    '• تختار السورة التي تبدأ بها، والترتيب: من الناس (منهج الحفظ) أو من الفاتحة (ترتيب المصحف).',
    '• تختار وقت الإرسال والأيام التي تناسبك.',
    '• يمكنك أخذ راحة وقتما تشاء، وتعود من حيث توقفت.',
    'اضغط Start للبدء بإذن الله.',
  ].join('\n'),
};
