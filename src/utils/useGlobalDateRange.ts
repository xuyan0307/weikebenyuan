import { useCallback, useEffect, useState } from 'react';
import { normalizedDateRange, quickDateRange, type DateRangeValue, type QuickDateRange } from './dateRange';

const STORAGE_KEY = 'weikebenyuan.global-date-range';
const CHANGE_EVENT = 'weikebenyuan:global-date-range-change';

function isDateRangeValue(value: unknown): value is DateRangeValue {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DateRangeValue>;
  return typeof candidate.start === 'string' && typeof candidate.end === 'string';
}

function readStoredRange(fallback: DateRangeValue): DateRangeValue {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return fallback;
    const parsed = JSON.parse(stored) as unknown;
    return isDateRangeValue(parsed) ? normalizedDateRange(parsed) : fallback;
  } catch {
    return fallback;
  }
}

function storeRange(value: DateRangeValue) {
  const normalized = normalizedDateRange(value);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent<DateRangeValue>(CHANGE_EVENT, { detail: normalized }));
  return normalized;
}

/** Platform-wide date range. It survives route changes and browser refreshes. */
export function useGlobalDateRange(defaultRange: QuickDateRange = 'month') {
  const fallback = quickDateRange(defaultRange);
  const [value, setValue] = useState<DateRangeValue>(() => readStoredRange(fallback));

  useEffect(() => {
    function syncFromEvent(event: Event) {
      const detail = (event as CustomEvent<DateRangeValue>).detail;
      if (isDateRangeValue(detail)) setValue(normalizedDateRange(detail));
    }
    function syncFromStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        const parsed = JSON.parse(event.newValue) as unknown;
        if (isDateRangeValue(parsed)) setValue(normalizedDateRange(parsed));
      } catch {
        // Ignore malformed values and keep the last valid range.
      }
    }
    window.addEventListener(CHANGE_EVENT, syncFromEvent);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, syncFromEvent);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  const update = useCallback((next: DateRangeValue) => {
    setValue(storeRange(next));
  }, []);

  return [value, update] as const;
}
