export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isLocalDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12);
  return year >= 2000 && year <= 9999 && localDay(parsed) === value;
}

export function scheduledDate(day: string, doseTime: string): Date {
  if (!isLocalDay(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(doseTime)) {
    throw new Error('服薬予定の日付または時刻が正しくありません。');
  }
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute] = doseTime.split(':').map(Number);
  return new Date(year, month - 1, date, hour, minute);
}

// Advance calendar days at noon so daylight-saving changes do not skip a date.
export function addLocalDays(day: string, amount: number): string {
  const date = scheduledDate(day, '12:00');
  date.setDate(date.getDate() + amount);
  return localDay(date);
}

export function followingDay(day: string): string {
  return addLocalDays(day, 1);
}

export function nearbyScheduledDays(now: Date): string[] {
  return [-1, 0, 1].map((offset) => localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12)));
}
