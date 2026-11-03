export function dateKey(date: Date): string {
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(2000, month - 1, day, 12);
  date.setFullYear(year);
  return dateKey(date) === value ? date : null;
}

export function monthDays(year: number, month: number): Date[] {
  const start = new Date(year, month, 1, 12);
  start.setDate(1 - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function dateAllowed(value: string, min?: string, max?: string): boolean {
  return !!parseDate(value) && (!min || value >= min) && (!max || value <= max);
}
