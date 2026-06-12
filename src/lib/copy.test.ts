import { describe, it, expect } from 'vitest';
import { ALL_DAYS, NO_DAYS, maskFromDays } from '../core';
import {
  reviewSummaryAr,
  settingsSummary,
  daysSummaryAr,
  formatTimeAr,
  orderSummaryAr,
  positionSummaryAr,
  ayatCountAr,
  ltr,
} from './copy';

describe('formatTimeAr', () => {
  it('pads to two digits and uses Arabic-Indic digits', () => {
    expect(formatTimeAr(7, 0)).toBe('٠٧:٠٠');
    expect(formatTimeAr(23, 59)).toBe('٢٣:٥٩');
  });
});

describe('daysSummaryAr', () => {
  it('summarises all / none / some', () => {
    expect(daysSummaryAr(ALL_DAYS)).toBe('كل الأيام');
    expect(daysSummaryAr(NO_DAYS)).toContain('لا يوجد');
    expect(daysSummaryAr(maskFromDays([5]))).toBe('الجمعة');
  });

  it('lists days Saturday first, whatever order they were set in', () => {
    // Monday (1) and Saturday (6): Saturday must come first.
    expect(daysSummaryAr(maskFromDays([1, 6]))).toBe('السبت، الإثنين');
    // Friday (5) is always last.
    expect(daysSummaryAr(maskFromDays([6, 5]))).toBe('السبت، الجمعة');
  });
});

describe('ltr (bidi isolation)', () => {
  it('wraps a run in the isolate characters so latin reads left-to-right', () => {
    const open = String.fromCodePoint(0x2066); // First Strong Isolate
    const close = String.fromCodePoint(0x2069); // Pop Directional Isolate
    expect(ltr('/time 07:00')).toBe(`${open}/time 07:00${close}`);
  });
});

describe('reviewSummaryAr (Arabic number-noun agreement)', () => {
  it('uses the right form for 0, 1, 2, 3-10, and 11+', () => {
    expect(reviewSummaryAr(0)).toContain('بدون مراجعة');
    expect(reviewSummaryAr(1)).toBe('آية سابقة واحدة');
    expect(reviewSummaryAr(2)).toBe('آيتان سابقتان');
    expect(reviewSummaryAr(3)).toBe('٣ آيات سابقة');
    expect(reviewSummaryAr(10)).toBe('١٠ آيات سابقة');
    expect(reviewSummaryAr(11)).toBe('١١ آية سابقة');
    expect(reviewSummaryAr(20)).toBe('٢٠ آية سابقة');
  });
});

describe('settingsSummary status line', () => {
  const base = {
    deliveryHour: 7,
    deliveryMinute: 0,
    activeDays: ALL_DAYS,
    reviewCount: 10,
    tafseerEnabled: true,
    tafseerLabel: 'التفسير الميسر',
    tafseerModeLabel: 'نصًّا',
    reciterLabel: 'الحصري (المعلِّم)',
    timezone: 'Africa/Cairo',
    pausedAt: null as Date | null,
  };

  it('shows working when active with at least one day', () => {
    expect(settingsSummary(base)).toContain('يعمل');
  });

  it('shows the tafseer line with edition and format when on, and just "off" when off', () => {
    const on = settingsSummary({
      ...base,
      tafseerLabel: 'تفسير السعدي',
      tafseerModeLabel: 'رابطًا',
    });
    expect(on).toContain('• التفسير: مفعّل (تفسير السعدي · رابطًا) 📖');
    expect(settingsSummary({ ...base, tafseerEnabled: false })).toContain('• التفسير: معطّل');
  });

  it('shows the reciter (recitation) line', () => {
    expect(settingsSummary(base)).toContain('• التلاوة: الحصري (المعلِّم)');
    expect(settingsSummary({ ...base, reciterLabel: 'بدون تلاوة 🔇' })).toContain(
      '• التلاوة: بدون تلاوة',
    );
  });

  it('warns (not "working") when no days are chosen', () => {
    const summary = settingsSummary({ ...base, activeDays: NO_DAYS });
    expect(summary).toContain('لن تصلك آيات');
    expect(summary).not.toContain('يعمل ✅');
  });

  it('shows the break state when paused', () => {
    expect(settingsSummary({ ...base, pausedAt: new Date() })).toContain('وضع الراحة');
  });

  it('omits the position and order lines when they are not provided', () => {
    const summary = settingsSummary(base);
    expect(summary).not.toContain('الموضع');
    expect(summary).not.toContain('الترتيب');
  });

  it('shows the current position and order when provided', () => {
    const summary = settingsSummary({
      ...base,
      position: { surahNameAr: 'الملك', numberInSurah: 5, surahAyahCount: 30 },
      orderKey: 'mushaf',
    });
    expect(summary).toContain('• الموضع: سورة الملك، آية ٥ من ٣٠');
    expect(summary).toContain('• الترتيب: ترتيب المصحف (من الفاتحة)');
  });

  it('shows a delivered-ayat progress line, and hides it at zero', () => {
    expect(settingsSummary({ ...base, deliveredCount: 42 })).toContain('• ما حفظته معنا: ٤٢ آية');
    expect(settingsSummary({ ...base, deliveredCount: 0 })).not.toContain('ما حفظته معنا');
    expect(settingsSummary(base)).not.toContain('ما حفظته معنا');
  });
});

describe('orderSummaryAr / positionSummaryAr', () => {
  it('labels the two known orders and falls back to the raw key', () => {
    expect(orderSummaryAr('kids-hifz')).toContain('من الناس');
    expect(orderSummaryAr('mushaf')).toContain('من الفاتحة');
    expect(orderSummaryAr('unknown')).toBe('unknown');
  });

  it('renders a position with Arabic-Indic digits', () => {
    expect(positionSummaryAr('الفاتحة', 1)).toBe('سورة الفاتحة، آية ١');
    expect(positionSummaryAr('البقرة', 25)).toBe('سورة البقرة، آية ٢٥');
  });

  it('adds the surah total when given ("ayah N of M")', () => {
    expect(positionSummaryAr('الملك', 5, 30)).toBe('سورة الملك، آية ٥ من ٣٠');
  });
});

describe('ayatCountAr (number-noun agreement)', () => {
  it('uses the right form for 1, 2, 3-10, and 11+', () => {
    expect(ayatCountAr(1)).toBe('آية واحدة');
    expect(ayatCountAr(2)).toBe('آيتان');
    expect(ayatCountAr(3)).toBe('٣ آيات');
    expect(ayatCountAr(10)).toBe('١٠ آيات');
    expect(ayatCountAr(11)).toBe('١١ آية');
    expect(ayatCountAr(286)).toBe('٢٨٦ آية');
  });
});
