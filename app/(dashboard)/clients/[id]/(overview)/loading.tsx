/**
 * The client page's frame, shown the instant a roster row is tapped (the page's reads take a moment): the name, the
 * Log session button and the tabs, in the page's own sizes so nothing jumps when the real page takes its place.
 * In the (overview) group so it covers this page only, not the session, plan and logger pages under it.
 */
export default function ClientLoading() {
  return (
    <div aria-busy="true" aria-label="Opening the client" className="pb-12">
      <div className="mb-4 flex h-11 items-center">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-muted" />
      </div>
      <div className="mb-8 h-14 w-full animate-pulse rounded-2xl bg-muted sm:max-w-sm" />
      <div className="mb-12 h-[52px] w-full max-w-md animate-pulse rounded-2xl bg-muted/60" />
    </div>
  );
}
