export const ASIA_JAKARTA_TIMEZONE = 'Asia/Jakarta';

const getDatePartsInTimeZone = (date: Date, timeZone: string): { day: number; month: number; year: number } => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const map = new Map<string, string>();
  for (const part of parts) {
    if (part.type !== 'literal') map.set(part.type, part.value);
  }

  return {
    year: Number(map.get('year') ?? 0),
    month: Number(map.get('month') ?? 0),
    day: Number(map.get('day') ?? 0),
  };
};

export const formatDateKey = (date: Date, timeZone = ASIA_JAKARTA_TIMEZONE): string => {
  const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const createDateFromValue = (value: unknown): Date | null => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const rawValue = String(value ?? '').trim();
  if (!rawValue) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) return new Date(`${rawValue}T00:00:00+07:00`);

  const date = new Date(rawValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateLabel = (date: Date): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: ASIA_JAKARTA_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);

export const formatDayName = (date: Date): string =>
  new Intl.DateTimeFormat('en-US', { timeZone: ASIA_JAKARTA_TIMEZONE, weekday: 'long' }).format(date);

export const getCurrentDateKey = (): string => formatDateKey(new Date());

export const formatActivityDate = (value: string): string => {
  if (!value) return '--';
  const date = createDateFromValue(value);
  if (!date) return value;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ASIA_JAKARTA_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

/** Geser kunci tanggal 'YYYY-MM-DD' sebanyak `days` hari (tanpa pengaruh timezone). */
export const shiftDateKey = (key: string, days: number): string => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

/** Daftar kunci tanggal dari `start` sampai `end` (inklusif). */
export const buildDateRange = (start: string, end: string): string[] => {
  const keys: string[] = [];
  for (let key = start; key <= end && keys.length < 62; key = shiftDateKey(key, 1)) keys.push(key);
  return keys;
};

export const toDateInfo = (key: string): { key: string; label: string; dayName: string } => {
  const date = createDateFromValue(key) as Date;
  return { key, label: formatDateLabel(date), dayName: formatDayName(date) };
};

