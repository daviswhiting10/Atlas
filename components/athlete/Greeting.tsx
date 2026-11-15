"use client";

import { useEffect, useState } from "react";

/** Time-of-day greeting on one line, computed in the browser so it follows the visitor's clock. */
export function Greeting({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const hour = now?.getHours() ?? 9;
  const part = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const date = now?.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  return (
    <h1 className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="font-greeting text-[26px] leading-[1.15] text-ink sm:text-3xl">
        {part}, {name}
      </span>
      {/* The date fills in after the page loads; its space is held so the line doesn't move. */}
      <span className="eyebrow inline-block min-w-[6.5rem]">{date ?? " "}</span>
    </h1>
  );
}
