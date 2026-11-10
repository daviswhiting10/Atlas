"use client";

import { useEffect, useState } from "react";

/** Time-of-day greeting, computed in the browser so it follows the visitor's clock. */
export function Greeting({ name }: { name: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);

  const hour = now?.getHours() ?? 9;
  const part = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const date = now?.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  return (
    <div>
      <p className="eyebrow h-4">{date ?? " "}</p>
      <h1 className="font-greeting mt-1.5 text-[38px] leading-[1.05] text-ink sm:text-5xl">
        {part}, {name}
      </h1>
    </div>
  );
}
