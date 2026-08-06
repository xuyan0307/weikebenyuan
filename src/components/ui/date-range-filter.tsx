import { useEffect, useRef, useState } from 'react';
import { CalendarDaysIcon, ChevronDownIcon } from 'lucide-react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { zhCN } from 'date-fns/locale';
import 'react-day-picker/style.css';
import './date-range-filter.css';
import {
  GLOBAL_DATE_RANGE_QUICK_OPTIONS,
  formatLocalDate,
  quickDateRange,
  type DateRangeValue,
  type QuickDateRange,
} from '../../utils/dateRange';

export interface DateRangeQuickOption {
  label: string;
  value: QuickDateRange;
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  quickOptions?: ReadonlyArray<DateRangeQuickOption>;
  onQuickSelect?: (value: QuickDateRange) => void;
  label?: string;
  className?: string;
  align?: 'left' | 'right';
}

function parseLocalDate(value: string) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

export function DateRangeFilter({
  value,
  onChange,
  quickOptions = GLOBAL_DATE_RANGE_QUICK_OPTIONS,
  onQuickSelect,
  label = '时间范围',
  className = '',
  align = 'left',
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const [selectingStart, setSelectingStart] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  const selected: DateRange | undefined = value.start
    ? { from: parseLocalDate(value.start), to: parseLocalDate(value.end) }
    : undefined;

  useEffect(() => {
    function closeOnOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', closeOnOutside);
    return () => document.removeEventListener('mousedown', closeOnOutside);
  }, []);

  function selectDay(day: Date) {
    const date = formatLocalDate(day);
    if (selectingStart || !value.start) {
      onChange({ start: date, end: '' });
      setSelectingStart(false);
      return;
    }
    onChange(date < value.start
      ? { start: date, end: value.start }
      : { start: value.start, end: date });
    setSelectingStart(true);
    setOpen(false);
  }

  function selectQuick(value: QuickDateRange) {
    onChange(quickDateRange(value));
    onQuickSelect?.(value);
    setOpen(false);
  }

  const display = value.start || value.end
    ? `${value.start || '开始时间'}  至  ${value.end || '结束时间'}`
    : '全部时间';
  const compactDisplay = value.start && value.end && value.start.slice(0, 4) === value.end.slice(0, 4)
    ? `${value.start} 至 ${value.end.slice(5)}`
    : display;
  const shortLabel = label.replace(/时间范围$/, '');

  return (
    <div ref={ref} className={`relative flex-shrink-0 ${className}`} data-cmp="DateRangeFilter">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        className="flex h-9 w-[232px] min-w-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2 text-foreground hover:border-primary"
        onClick={() => setOpen(current => {
          if (!current) setSelectingStart(true);
          return !current;
        })}
      >
        <CalendarDaysIcon size={15} className="flex-shrink-0 text-muted-foreground" />
        {shortLabel && (
          <span className="max-w-[32px] flex-shrink-0 truncate whitespace-nowrap text-xs font-medium text-muted-foreground" title={label}>{shortLabel}</span>
        )}
        <span className="min-w-0 flex-1 truncate whitespace-nowrap text-left text-xs" title={display}>{compactDisplay}</span>
        <ChevronDownIcon size={14} className={`flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className={`date-range-picker absolute top-full z-[120] mt-2 rounded-xl border border-border bg-card p-3 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          <DayPicker
            mode="range"
            locale={zhCN}
            numberOfMonths={2}
            selected={selected}
            onDayClick={selectDay}
            defaultMonth={selected?.from ?? new Date()}
            showOutsideDays
          />
          {quickOptions.length > 0 && (
            <div className="mt-2 flex items-center gap-2 border-t border-border pt-3">
              {quickOptions.map(option => (
                <button
                  type="button"
                  key={option.value}
                  className="rounded-md bg-muted px-3 py-1.5 text-sm text-primary hover:bg-primary/10"
                  onClick={() => selectQuick(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
