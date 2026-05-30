import { useEffect, useState } from "react";

export type ContentFadePhase = "loading" | "fading" | "done";

export function useContentFade(isLoading: boolean): ContentFadePhase {
  const [phase, setPhase] = useState<ContentFadePhase>("loading");

  useEffect(() => {
    if (!isLoading && phase === "loading") {
      setPhase("fading");
      const t = setTimeout(() => setPhase("done"), 200);
      return () => clearTimeout(t);
    }
  }, [isLoading, phase]);

  return phase;
}
