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

export interface SettingsView {
  deliveryHour: number;
  deliveryMinute: number;
  activeDays: number;
  reviewCount: number;
  timezone: string;
  pausedAt: Date | null;
}

export function settingsSummary(s: SettingsView): string {
  // The status reflects what will ACTUALLY happen: a break, or no chosen days,
  // both mean no ayat arrive. We do not show "working" when nothing will come.
  let status: string;
  if (s.pausedAt) status = 'في وضع الراحة ⏸️';
  else if (activeDaysList(s.activeDays).length === 0) status = 'لن تصلك آيات (لم تختر أي يوم) ⚠️';
  else status = 'يعمل ✅';

  return [
    'إعداداتك الحالية:',
    `• الحالة: ${status}`,
    `• وقت الإرسال: ${formatTimeAr(s.deliveryHour, s.deliveryMinute)}`,
    `• الأيام: ${daysSummaryAr(s.activeDays)}`,
    `• المراجعة: ${reviewSummaryAr(s.reviewCount)}`,
    `• المنطقة الزمنية: ${s.timezone}`,
  ].join('\n');
}

export const COPY = {
  welcome: (settings: string) =>
    [
      'السلام عليكم ورحمة الله 🌿',
      '',
      'مرحبًا بك في بوت "آية". أنت الآن مسجَّل، وستتقدّم آية واحدة كل يوم بإذن الله، نبدأ من سورة الناس ونمضي إلى الفاتحة.',
      '',
      'ستصلك أول آية في وقت الإرسال المحدّد أدناه، أو الآن مباشرة إن كان وقتها قد حان اليوم.',
      '👈 لرؤية آيتك الآن اضغط /today',
      '',
      settings,
      '',
      'إن وصلتك الآية في وقت غير متوقَّع فقد تختلف منطقتك الزمنية، اضبطها عبر /timezone.',
      'ولعرض كل الأوامر اكتب /help',
    ].join('\n'),

  help: [
    'بوت "آية" يساعدك على حفظ القرآن بإرسال آية واحدة كل يوم مع آيات سابقة للمراجعة.',
    '',
    'الأوامر:',
    '/today — عرض آية اليوم الآن (بدون تغيير موضعك)',
    '/time HH:MM — ضبط وقت الإرسال، مثال: /time 07:00',
    '/days — اختيار أيام الإرسال',
    '/review N — عدد آيات المراجعة (من ٠ إلى ٢٠)، مثال: /review 5',
    '/timezone — ضبط المنطقة الزمنية، مثال: /timezone Africa/Cairo',
    '/break — أخذ راحة، يتوقف الإرسال ويبقى موضعك محفوظًا',
    '/resume — العودة من الراحة من حيث توقفت',
    '/settings — عرض إعداداتك الحالية',
  ].join('\n'),

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
