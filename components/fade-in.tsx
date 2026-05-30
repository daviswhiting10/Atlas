"use client";

import type { ReactNode } from "react";

export function FadeIn({ children }: { children: ReactNode }) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-[250ms] ease-out">
      {children}
    </div>
  );
}
