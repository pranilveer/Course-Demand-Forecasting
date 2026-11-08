import { TERM_DATES, type Rng, type TermCode } from '@yottaflex/shared';

const DAY_MS = 86_400_000;

export function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(value: string, days: number): string {
  return formatDate(new Date(parseDate(value).getTime() + days * DAY_MS));
}

export function randomDate(rng: Rng, start: string, end: string): string {
  const startTime = parseDate(start).getTime();
  const endTime = parseDate(end).getTime();
  const span = Math.max(0, Math.floor((endTime - startTime) / DAY_MS));
  return formatDate(new Date(startTime + rng.nextInt(0, span) * DAY_MS));
}

export function termStart(term: TermCode): string {
  return TERM_DATES[term].start;
}

export function termEnd(term: TermCode): string {
  return TERM_DATES[term].end;
}

export function dateTime(value: string, time = '00:00:00'): string {
  return `${value.slice(0, 10)}T${time}.000Z`;
}

export function termDateTime(term: TermCode, dayOffset = 0, time = '00:00:00'): string {
  return dateTime(addDays(termStart(term), dayOffset), time);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS);
}

export function minDate(left: string, right: string): string {
  return left <= right ? left : right;
}

export function maxDate(left: string, right: string): string {
  return left >= right ? left : right;
}

export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}
