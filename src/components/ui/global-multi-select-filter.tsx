import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import {
  GLOBAL_FILTER_NONE,
  isGlobalMultiSelectAll,
  matchesGlobalMultiSelect,
  toggleGlobalMultiSelectAll,
  toggleGlobalMultiSelectOption,
} from '../../utils/multiSelectFilter';

export { GLOBAL_FILTER_NONE, matchesGlobalMultiSelect };

export interface GlobalFilterOption {
  value: string;
  label: string;
}

interface GlobalMultiSelectFilterProps {
  label: string;
  options: GlobalFilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  width?: number;
}

export function GlobalMultiSelectFilter({
  label,
  options,
  selected,
  onChange,
  width = 180,
}: GlobalMultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const effectiveSelected = selected.filter(value => value !== GLOBAL_FILTER_NONE);
  const noneSelected = selected.includes(GLOBAL_FILTER_NONE);
  const optionValues = options.map(option => option.value);
  const allSelected = isGlobalMultiSelectAll(selected, optionValues);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const displayValue = noneSelected
    ? '全不选'
    : allSelected
      ? '全选'
      : effectiveSelected.length === 1
        ? options.find(option => option.value === effectiveSelected[0])?.label || label
        : `已选 ${effectiveSelected.length} 项`;

  const toggleAll = () => {
    onChange(toggleGlobalMultiSelectAll(selected, optionValues));
  };

  const toggleOne = (value: string) => {
    onChange(toggleGlobalMultiSelectOption(selected, value, optionValues));
  };

  return (
    <div ref={rootRef} className="global-multi-select-filter relative flex-shrink-0">
      <button
        type="button"
        className="global-multi-select-filter__trigger flex h-10 items-center justify-between gap-2 rounded-lg border px-3 text-sm transition-colors"
        style={{
          minWidth: 128,
          borderColor: allSelected ? 'var(--border)' : 'var(--brand)',
          background: allSelected ? 'var(--card)' : 'rgba(30,136,229,0.08)',
        }}
        onClick={() => setOpen(value => !value)}
      >
        <span className="truncate">
          <span style={{ color: 'var(--muted-foreground)' }}>{label}</span>
          <span className="ml-1" style={{ color: allSelected ? 'var(--foreground)' : 'var(--brand)' }}>
            {displayValue}
          </span>
        </span>
        <ChevronDownIcon
          size={14}
          style={{
            color: 'var(--muted-foreground)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }}
        />
      </button>

      {open && (
        <div
          className="global-multi-select-filter__menu absolute left-0 top-11 z-50 overflow-hidden rounded-xl border shadow-xl"
          style={{ width, background: 'var(--card)', borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            className="global-multi-select-filter__option flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm hover:bg-muted"
            style={{ borderColor: 'var(--border)' }}
            onClick={toggleAll}
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded"
              style={{
                border: `1.5px solid ${allSelected ? 'var(--brand)' : 'var(--border)'}`,
                background: allSelected ? 'var(--brand)' : 'transparent',
              }}
            >
              {allSelected && <CheckIcon size={11} color="#fff" />}
            </span>
            全选
          </button>
          {options.map(option => {
            const checked = allSelected || effectiveSelected.includes(option.value);
            return (
              <button
                type="button"
                key={option.value}
                className="global-multi-select-filter__option flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
                onClick={() => toggleOne(option.value)}
              >
                <span
                  className="flex h-4 w-4 items-center justify-center rounded"
                  style={{
                    border: `1.5px solid ${checked ? 'var(--brand)' : 'var(--border)'}`,
                    background: checked ? 'var(--brand)' : 'transparent',
                  }}
                >
                  {checked && <CheckIcon size={11} color="#fff" />}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
