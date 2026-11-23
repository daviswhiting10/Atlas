"use client";

import { createContext, useContext, useEffect } from "react";
import type { Mode } from "@/lib/mode";

/** What the optimistic shell needs to draw the other side's header and bottom bar before its page arrives. */
export type Chrome = { demo: boolean; hasProgress: boolean };

export type ModeSwitch = {
  /** The side to show: the one just tapped, even while its page is still loading. */
  shown: Mode;
  /** Ask for a side. Safe to call as often as you like. */
  go: (target: Mode) => void;
  /** Each side's header says what its shell should look like. */
  setChrome: (c: Partial<Chrome>) => void;
};

export const ModeSwitchContext = createContext<ModeSwitch | null>(null);

export const useModeSwitch = () => useContext(ModeSwitchContext);

/** Called by each side's own header, so the other side's shell can be drawn the same way. */
export function useRegisterChrome(c: Partial<Chrome>) {
  const sw = useModeSwitch();
  const setChrome = sw?.setChrome;
  const { demo, hasProgress } = c;
  useEffect(() => setChrome?.({ demo, hasProgress }), [setChrome, demo, hasProgress]);
}
