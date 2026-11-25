/**
 * Try again on an error screen. reset() alone only redraws the boundary with the page it
 * already has, the one that failed, so the server is asked for the page again first.
 */
export function retryScreen(router: { refresh: () => void }, reset: () => void): void {
  router.refresh();
  reset();
}
