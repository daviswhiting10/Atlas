"use client";

import { useEffect } from "react";
import { saveTimeZoneIfEmpty } from "@/lib/actions/time-zone";

/** Sends the browser's timezone once. Rendered only while the account has none saved (SaveTimeZoneIfEmpty). No UI. */
export function SaveTimeZone() {
  useEffect(() => {
    void saveTimeZoneIfEmpty(Intl.DateTimeFormat().resolvedOptions().timeZone).catch(() => {});
  }, []);
  return null;
}
