import { describe, it, expect } from 'vitest';
import { ALL_DAYS, NO_DAYS, maskFromDays } from '@ayah/core';
import { reviewSummaryAr, settingsSummary, daysSummaryAr, formatTimeAr } from './copy';

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
    timezone: 'Africa/Cairo',
    pausedAt: null as Date | null,
  };

  it('shows working when active with at least one day', () => {
    expect(settingsSummary(base)).toContain('يعمل');
  });

  it('warns (not "working") when no days are chosen', () => {
    const summary = settingsSummary({ ...base, activeDays: NO_DAYS });
    expect(summary).toContain('لن تصلك آيات');
    expect(summary).not.toContain('يعمل ✅');
  });

  it('shows the break state when paused', () => {
    expect(settingsSummary({ ...base, pausedAt: new Date() })).toContain('وضع الراحة');
  });
});
