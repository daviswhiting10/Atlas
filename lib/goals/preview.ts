/**
 * What starting a goal on a given day would mean, so the person sees the day
 * number before anything is saved. A start day in the past means those days
 * happened before Atlas: they're carried in, and today is the first real day.
 *
 * Pure: no I/O.
 */

import { daysBetween } from "./days";

export type StartPreview = { ok: true; carriedDays: number; dayOfGoal: number } | { ok: false; error: string };

export function previewStart(startDay: string, today: string, length: number): StartPreview {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDay)) return { ok: false, error: "Pick a start day." };
  const carriedDays = daysBetween(startDay, today);
  if (carriedDays < 0) return { ok: false, error: "The start day can't be in the future." };
  if (carriedDays > 400) return { ok: false, error: "That's too far back." };
  if (carriedDays >= length) return { ok: false, error: `That's ${carriedDays + 1} days ago: past the ${length} days this goal runs.` };
  return { ok: true, carriedDays, dayOfGoal: carriedDays + 1 };
}
