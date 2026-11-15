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

/**
 * The server's check before a goal starts: the day number the form showed
 * must be the one this start day gives now. A mismatch means the form sent
 * a different day than it displayed (a date wheel committing late), or the
 * day turned over in between. Either way, nothing is saved and the person
 * looks again.
 */
export function confirmStart(startDay: string, today: string, length: number, shownDay: number): StartPreview {
  const preview = previewStart(startDay, today, length);
  if (!preview.ok) return preview;
  if (preview.dayOfGoal !== shownDay) {
    return { ok: false, error: `That start day makes today Day ${preview.dayOfGoal}, not Day ${shownDay}. Check the start day and tap Start again.` };
  }
  return preview;
}

/**
 * Does starting need a "are you sure?" step? Only when the start day is in the past: that is the case
 * where the day number is not the obvious 1, and where days get counted as done. Starting today is one tap.
 */
export const needsConfirmation = (p: StartPreview): boolean => p.ok && p.carriedDays > 0;
