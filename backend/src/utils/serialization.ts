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
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

