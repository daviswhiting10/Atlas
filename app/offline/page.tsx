// Static offline fallback page — served by the service worker when a
// navigation request fails and no cached version of the page exists.
// Must be statically rendered so next-pwa can precache it.
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center">
      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mb-6">
        <svg
          className="w-6 h-6 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3l18 18M8.111 8.111A7.5 7.5 0 0119.5 12m-1.5 3.75a7.5 7.5 0 01-12.77-5.61M12 12v.01"
          />
        </svg>
      </div>
      <h1 className="text-xl font-bold tracking-tight mb-2">You&apos;re offline</h1>
      <p className="text-sm text-muted-foreground max-w-xs">
        Reconnect to continue. Pages you&apos;ve already visited are still available —
        tap Back or navigate to a cached route.
      </p>
    </div>
  );
}
