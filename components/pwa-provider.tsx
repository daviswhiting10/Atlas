"use client";

// PWAProvider — mounts in the root layout.
//
// Responsibilities:
//   1. Detects online/offline transitions and surfaces a persistent toast so
//      the user knows writes won't save while offline.
//   2. Nothing else — SW registration is handled automatically by
//      @ducanh2912/next-pwa at build time; this component does not touch it.
//
// Stage 4 will extend this with an IndexedDB write-queue and a sync indicator.

import { useEffect } from "react";
import { toast } from "sonner";

const OFFLINE_TOAST_ID = "atlas-offline";

export function PWAProvider() {
  useEffect(() => {
    function handleOffline() {
      toast.warning("You're offline. Reconnect to save.", {
        id: OFFLINE_TOAST_ID,
        duration: Infinity, // stays until dismissed or back online
      });
    }

    function handleOnline() {
      toast.dismiss(OFFLINE_TOAST_ID);
      toast.success("Back online", { duration: 2500 });
    }

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Surface the toast immediately if the app opened while already offline
    if (!navigator.onLine) handleOffline();

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  // No visual output — effect only
  return null;
}
