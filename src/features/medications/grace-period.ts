export const MIN_GRACE_MINUTES = 5;
export const MAX_GRACE_MINUTES = 60;
export const DEFAULT_GRACE_MINUTES = 30;
export const DEFAULT_GRACE_BEFORE_MINUTES = 0;
export const GRACE_MINUTE_OPTIONS = Array.from(
  { length: MAX_GRACE_MINUTES / MIN_GRACE_MINUTES },
  (_, index) => (index + 1) * MIN_GRACE_MINUTES,
);

export function isGraceMinutes(value: number): boolean {
  return Number.isInteger(value)
    && value >= MIN_GRACE_MINUTES
    && value <= MAX_GRACE_MINUTES
    && value % MIN_GRACE_MINUTES === 0;
}

export function medicationGraceMinutes(value: number | undefined): number {
  return value === undefined ? DEFAULT_GRACE_MINUTES : value;
}

export function isGraceBeforeMinutes(value: number): boolean {
  return value === 0 || isGraceMinutes(value);
}

export function medicationGraceBeforeMinutes(value: number | undefined): number {
  return value ?? DEFAULT_GRACE_BEFORE_MINUTES;
}
