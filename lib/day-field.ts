/**
 * Which day a form should submit from a date field. Pure.
 *
 * Why it exists: on iPhone the date wheel only commits its value when it
 * closes, and the tap that closes it can also press the button next to it.
 * The button's handler then runs with the day from the last render (today),
 * not the day now shown in the field. So a form reads the field itself at
 * submit time, and falls back to its state only when the field can't say.
 */

export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The day to submit: what the field shows right now when that's a real day,
 * else the form's state. An empty field means "no day" only where the form
 * allows that (an optional date); otherwise the state is kept.
 */
export function pickDay(fieldValue: string | null | undefined, stateValue: string, opts: { allowEmpty?: boolean } = {}): string {
  if (fieldValue == null) return stateValue;
  if (ISO_DAY.test(fieldValue)) return fieldValue;
  if (fieldValue === "" && opts.allowEmpty) return "";
  return stateValue;
}

/** pickDay, reading the field through its ref. */
export function dayFrom(ref: { current: { value: string } | null }, stateValue: string, opts: { allowEmpty?: boolean } = {}): string {
  return pickDay(ref.current?.value, stateValue, opts);
}
