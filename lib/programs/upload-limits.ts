/**
 * How big an upload can be. The host takes about 4.5 MB a request (Vercel); anything bigger never reaches the route,
 * so the browser checks first and says what to do. Screenshots are made smaller in the browser before they go up;
 * a PDF goes up as it is (drawing its pages in the browser would need pdf.js there). Pure.
 */
export const MAX_UPLOAD_BYTES = 4_000_000;
/** Screenshots are made at most this wide or tall before upload: still easy to read, a fraction of the bytes. */
export const MAX_IMAGE_EDGE = 1600;

const mb = (n: number) => `${(n / 1_000_000).toFixed(1)} MB`;

export function tooBigMessage(bytes: number, pdf: boolean): string {
  return pdf
    ? `That PDF is ${mb(bytes)}, and the most Atlas can take is ${mb(MAX_UPLOAD_BYTES)}. Try screenshots of its pages instead.`
    : `Those images are ${mb(bytes)} together, and the most Atlas can take is ${mb(MAX_UPLOAD_BYTES)}. Try fewer at a time.`;
}

/** The size to draw an image at so its longer side is at most `max` (never larger than it is). */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_EDGE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
