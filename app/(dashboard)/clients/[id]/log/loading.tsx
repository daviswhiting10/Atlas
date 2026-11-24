/**
 * The logger's shell, shown the instant the route opens (the data takes a moment): the live-session bar grows into this,
 * then the real logger takes its place. Same width and header height as the logger, so nothing jumps.
 */
export default function LoggerLoading() {
  return (
    <div data-live-root aria-busy="true" aria-label="Opening the session" className="mx-auto max-w-2xl bg-background px-0 pt-3 md:p-6">
      <div className="mb-4 h-9 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="mb-5 h-8 w-64 animate-pulse rounded-lg bg-muted" />
      <div className="space-y-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-line bg-muted/60" />
        ))}
      </div>
    </div>
  );
}
