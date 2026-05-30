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

export interface SettingsView {
  deliveryHour: number;
  deliveryMinute: number;
  activeDays: number;
  timezone: string;
  pausedAt: Date | null;
}

export function settingsSummary(s: SettingsView): string {
  const status = s.pausedAt ? 'متوقف مؤقتًا (راحة) ⏸️' : 'يعمل ✅';
  return [
    'إعداداتك الحالية:',
    `• الحالة: ${status}`,
    `• وقت الإرسال: ${formatTimeAr(s.deliveryHour, s.deliveryMinute)}`,
    `• الأيام: ${daysSummaryAr(s.activeDays)}`,
    `• المنطقة الزمنية: ${s.timezone}`,
  ].join('\n');
}

export const COPY = {
  welcome: (settings: string) =>
    [
      'السلام عليكم ورحمة الله 🌿',
      '',
      'مرحبًا بك في بوت "آية". سيصلك كل يوم آية جديدة للحفظ، ومعها آخر ١٠ آيات من نفس السورة للمراجعة، بإذن الله.',
      '',
      'نبدأ من سورة الناس ونمضي إلى الفاتحة (الترتيب المناسب للأطفال والمبتدئين).',
      '',
      settings,
      '',
      'الأوامر:',
      '/today — عرض آية اليوم الآن',
      '/time — ضبط وقت الإرسال',
      '/days — اختيار أيام الإرسال',
      '/timezone — ضبط المنطقة الزمنية',
      '/break — أخذ راحة (إيقاف الإرسال)',
      '/resume — العودة من الراحة',
      '/settings — عرض إعداداتك',
      '/help — المساعدة',
    ].join('\n'),

  help: [
    'بوت "آية" يساعدك على حفظ القرآن بإرسال آية واحدة كل يوم مع مراجعة آخر ١٠ آيات.',
    '',
    'الأوامر:',
    '/today — عرض آية اليوم الآن (بدون تغيير موضعك)',
    '/time HH:MM — ضبط وقت الإرسال، مثال: /time 07:00',
    '/days — اختيار أيام الإرسال',
    '/timezone — ضبط المنطقة الزمنية، مثال: /timezone Africa/Cairo',
    '/break — أخذ راحة، يتوقف الإرسال ويبقى موضعك محفوظًا',
    '/resume — العودة من الراحة من حيث توقفت',
    '/settings — عرض إعداداتك الحالية',
  ].join('\n'),

  brokenOrNotStarted:
    'لم نتمكن من تجهيز آية لك الآن. إن كنت قد أنهيت الختمة فأبشر، وإلا فحاول لاحقًا بإذن الله.',

  paused: 'تم إيقاف الإرسال مؤقتًا. خذ راحتك 🌿 وعندما تعود اكتب /resume لتكمل من حيث توقفت.',
  alreadyPaused: 'أنت في وضع الراحة بالفعل. اكتب /resume عندما تريد العودة.',
  resumed: 'أهلًا بعودتك 🌿 سنكمل من حيث توقفت بإذن الله.',
  alreadyActive: 'أنت لست في وضع الراحة. الإرسال يعمل بالفعل ✅',

  timeUsage: 'لضبط الوقت اكتب: /time HH:MM\nمثال: /time 07:00',
  timeInvalid: 'صيغة الوقت غير صحيحة. اكتب الوقت بصيغة ٢٤ ساعة، مثال: /time 07:00',
  timeUpdated: (t: string) => `تم ضبط وقت الإرسال على ${t} بتوقيتك المحلي ✅`,

  tzUsage: 'لضبط المنطقة الزمنية اكتب: /timezone Area/City\nمثال: /timezone Africa/Cairo',
  tzInvalid: 'اسم المنطقة الزمنية غير صحيح. مثال صحيح: Africa/Cairo',
  tzUpdated: (tz: string) => `تم ضبط المنطقة الزمنية على ${tz} ✅`,

  daysPrompt: 'اختر الأيام التي تريد أن تصلك فيها الآيات، ثم اضغط "تم":',
  daysUpdated: (summary: string) => `تم تحديث أيام الإرسال: ${summary} ✅`,
  daysNone: 'لم تختر أي يوم، لن تصلك آيات. اختر يومًا واحدًا على الأقل، أو خذ راحة عبر /break.',
};
