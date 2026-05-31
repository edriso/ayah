// All the Arabic text the bot shows. Kept in one file so wording is easy to
// review and change without touching logic. Numbers shown to users are in
// Arabic-Indic digits to match the Quran text.

import { activeDaysList, toArabicDigits, ALL_DAYS } from '@ayah/core';

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

export function dayNameAr(isoWeekday: number): string {
  return DAY_NAMES_AR[isoWeekday] ?? String(isoWeekday);
}

/** "07:00" style clock, with Arabic-Indic digits. */
export function formatTimeAr(hour: number, minute: number): string {
  const h = toArabicDigits(hour).padStart(2, '٠');
  const m = toArabicDigits(minute).padStart(2, '٠');
  return `${h}:${m}`;
}

/** A friendly list of the active days, or "every day" when all are on. */
export function daysSummaryAr(mask: number): string {
  if (mask === ALL_DAYS) return 'كل الأيام';
  const days = activeDaysList(mask);
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

/** "سورة الملك — آية ٥": where the subscriber stands (or starts) now. */
export function positionSummaryAr(surahNameAr: string, numberInSurah: number): string {
  return `سورة ${surahNameAr} — آية ${toArabicDigits(numberInSurah)}`;
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
    `• المنطقة الزمنية: ${s.timezone}`,
  ];
  if (s.position) {
    lines.push(`• الموضع: ${positionSummaryAr(s.position.surahNameAr, s.position.numberInSurah)}`);
  }
  if (s.orderKey) lines.push(`• الترتيب: ${orderSummaryAr(s.orderKey)}`);
  return lines.join('\n');
}

export const COPY = {
  // Shown to a returning user (one who has already started). The starting
  // point is no longer hard-coded here — it is a choice shown in /settings.
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
      'لتغيير سورة البداية اكتب /surah، ولتغيير الترتيب اكتب /order، ولعرض كل الأوامر اكتب /help.',
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

  help: [
    'بوت "آية" يساعدك على حفظ القرآن بإرسال آية واحدة كل يوم مع آيات سابقة للمراجعة.',
    '',
    'الأوامر:',
    '/today — عرض آية اليوم الآن (بدون تغيير موضعك)',
    '/surah — اختيار سورة البداية، أو /surah رقم_السورة رقم_الآية مثال: /surah 67 5',
    '/order — اختيار الترتيب: منهج الحفظ (من الناس) أو ترتيب المصحف (من الفاتحة)',
    '/time HH:MM — ضبط وقت الإرسال، مثال: /time 07:00',
    '/days — اختيار أيام الإرسال',
    '/review N — عدد آيات المراجعة (من ٠ إلى ٢٠)، مثال: /review 5',
    '/timezone — ضبط المنطقة الزمنية، مثال: /timezone Africa/Cairo',
    '/pause — أخذ راحة أو العودة منها (يبقى موضعك محفوظًا)',
    '/settings — عرض إعداداتك الحالية',
  ].join('\n'),

  // Onboarding keyboard button labels.
  startDefaultBtn: 'ابدأ من سورة الناس (الافتراضي)',
  pickSurahBtn: '📖 اختر سورة البداية',
  mushafOrderBtn: '🔀 ترتيب المصحف (من الفاتحة)',

  // Surah / start-point copy.
  surahPrompt:
    'اختر السورة التي تريد أن تبدأ بها الحفظ:\nأو اكتب: /surah رقم_السورة رقم_الآية (مثال: /surah 67 5)',
  surahInvalid:
    'تعذّر فهم ذلك. اكتب رقم السورة (١ إلى ١١٤)، ويمكنك إضافة رقم الآية بعده.\nمثال: /surah 67 5',
  startSet: (surahNameAr: string, numberInSurah: number) =>
    `تم ✅ ستبدأ من ${positionSummaryAr(surahNameAr, numberInSurah)}.\n` +
    'لرؤيتها الآن اضغط /today. لتبدأ من آية معيّنة اكتب: /surah رقم_السورة رقم_الآية',

  // Order copy.
  orderPrompt: 'اختر ترتيب الحفظ:',
  orderUnchanged: (orderKey: string) => `أنت تتبع ${orderSummaryAr(orderKey)} بالفعل ✅`,
  orderSet: (orderKey: string) => `تم ضبط الترتيب على ${orderSummaryAr(orderKey)} ✅`,

  // Settings keyboard button labels.
  pauseBtn: '⏸️ أخذ راحة',
  resumeBtn: '▶️ العودة من الراحة',
  settingsSurahBtn: '📖 سورة البداية',

  brokenOrNotStarted: 'لم نتمكن من تجهيز آية لك الآن، حاول لاحقًا بإذن الله.',

  paused: 'تم إيقاف الإرسال مؤقتًا. خذ راحتك 🌿 وعندما تعود اكتب /resume لتكمل من حيث توقفت.',
  alreadyPaused: 'أنت في وضع الراحة بالفعل. اكتب /resume عندما تريد العودة.',
  resumed: 'أهلًا بعودتك 🌿 سنكمل من حيث توقفت بإذن الله.',
  alreadyActive: 'أنت لست في وضع الراحة. الإرسال يعمل بالفعل ✅',
  pausedHint: 'تذكير: أنت في وضع الراحة الآن، فلن تصلك الآيات تلقائيًا. اكتب /resume للعودة.',

  timePrompt: 'اختر وقت الإرسال من الأزرار، أو اكتبه يدويًا بصيغة /time HH:MM (مثال: /time 07:00):',
  timeInvalid: 'صيغة الوقت غير صحيحة. اكتب الوقت بصيغة ٢٤ ساعة، مثال: /time 07:00',
  timeUpdated: (t: string, tz: string) =>
    `تم ضبط وقت الإرسال على ${t} حسب منطقتك (${tz}) ✅\nإن لم تكن منطقتك صحيحة فاضبطها عبر /timezone.`,

  tzPrompt: 'اختر منطقتك الزمنية من المدن التالية، أو اكتب /timezone Area/City إن لم تجد مدينتك:',
  tzInvalid: 'اسم المنطقة الزمنية غير صحيح. مثال صحيح: Africa/Cairo',
  tzUpdated: (tz: string) => `تم ضبط المنطقة الزمنية على ${tz} ✅`,

  daysPrompt: 'اختر الأيام التي تريد أن تصلك فيها الآيات، ثم اضغط "تم":',
  daysUpdated: (summary: string) => `تم تحديث أيام الإرسال: ${summary} ✅`,
  daysNone: 'لم تختر أي يوم، لن تصلك آيات. اختر يومًا واحدًا على الأقل، أو خذ راحة عبر /break.',

  reviewUsage: (current: number) =>
    `عدد آيات المراجعة الحالي: ${reviewSummaryAr(current)}.\n` +
    'لتغييره اكتب: /review N\n' +
    'حيث N رقم من ٠ إلى ٢٠. مثال: /review 5\n' +
    'اكتب /review 0 لإيقاف المراجعة والاكتفاء بآية اليوم.',
  reviewInvalid: 'الرجاء كتابة رقم صحيح من ٠ إلى ٢٠. مثال: /review 5',
  reviewUpdated: (count: number) =>
    count === 0
      ? 'تم إيقاف المراجعة. ستصلك آية اليوم فقط ✅'
      : `تم ضبط المراجعة على ${reviewSummaryAr(count)} ✅`,
};
