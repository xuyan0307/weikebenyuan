export function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    const parsed = JSON.parse(value) as T | null;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function jsonOrNull(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

export function formatDateOnly(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const date = new Date(value as Date);
  if (Number.isNaN(date.getTime())) return '';
  // mysql2 materializes a DATE configured with timezone +08:00 as an instant such as
  // 2026-08-03T16:00:00Z. Containers run in UTC, so local getters would incorrectly
  // display that business date as August 3. Read every database date in China time.
  const chinaDate = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const year = chinaDate.getUTCFullYear();
  const month = String(chinaDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(chinaDate.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
