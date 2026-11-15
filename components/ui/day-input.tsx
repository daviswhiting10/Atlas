"use client";

import { forwardRef, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  /** "yyyy-mm-dd", or "" for no day. */
  value: string;
  /** Called with the field's day whenever it differs from `value`. */
  onDay: (day: string) => void;
};

/**
 * A date field for picking a day. Use it instead of a bare
 * `<input type="date">`, and submit with `dayFrom(ref, state)` from
 * lib/day-field.ts, so the form sends the day the field shows, not one from
 * an earlier render.
 *
 * It keeps the form's state in step on change, input and blur. On iPhone,
 * the wheel commits late, and a tap that closes it can also press a button.
 */
export const DayInput = forwardRef<HTMLInputElement, Props>(function DayInput({ value, onDay, onBlur, onInput, ...rest }, ref) {
  const sync = (day: string) => {
    if (day !== value) onDay(day);
  };
  return (
    <input
      {...rest}
      ref={ref}
      type="date"
      value={value}
      onChange={(e) => sync(e.target.value)}
      onInput={(e) => {
        sync(e.currentTarget.value);
        onInput?.(e);
      }}
      onBlur={(e) => {
        sync(e.target.value);
        onBlur?.(e);
      }}
    />
  );
});
