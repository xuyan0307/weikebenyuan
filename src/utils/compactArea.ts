/**
 * Keep detailed addresses from widening list columns while preserving the
 * complete value in the cell title/tooltip.
 */
export function compactAreaLabel(value: unknown, visibleCharacters = 2): string {
  const fullValue = String(value ?? '').trim();
  if (!fullValue || fullValue === '—') return '—';

  const characters = Array.from(fullValue);
  return characters.length > visibleCharacters
    ? `${characters.slice(0, visibleCharacters).join('')}…`
    : fullValue;
}
