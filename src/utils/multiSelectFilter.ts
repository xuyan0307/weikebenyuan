export const GLOBAL_FILTER_NONE = '__GLOBAL_FILTER_NONE__';

export function isGlobalMultiSelectAll(
  selected: readonly string[],
  optionValues: readonly string[]
) {
  return !selected.includes(GLOBAL_FILTER_NONE)
    && (selected.length === 0 || selected.length === optionValues.length);
}

export function matchesGlobalMultiSelect(value: string, selected: readonly string[]) {
  if (selected.includes(GLOBAL_FILTER_NONE)) return false;
  return selected.length === 0 || selected.includes(value);
}

export function toggleGlobalMultiSelectAll(
  selected: readonly string[],
  optionValues: readonly string[]
) {
  return isGlobalMultiSelectAll(selected, optionValues) ? [GLOBAL_FILTER_NONE] : [];
}

export function toggleGlobalMultiSelectOption(
  selected: readonly string[],
  value: string,
  optionValues: readonly string[]
) {
  const allSelected = isGlobalMultiSelectAll(selected, optionValues);
  const noneSelected = selected.includes(GLOBAL_FILTER_NONE);
  const effectiveSelected = selected.filter(item => item !== GLOBAL_FILTER_NONE);
  if (allSelected || noneSelected) return [value];
  if (effectiveSelected.includes(value)) {
    const next = effectiveSelected.filter(item => item !== value);
    return next.length > 0 ? next : [GLOBAL_FILTER_NONE];
  }
  const next = [...effectiveSelected, value];
  return next.length === optionValues.length ? [] : next;
}
