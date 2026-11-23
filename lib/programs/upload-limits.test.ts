import { describe, expect, it } from "vitest";
import { MAX_IMAGE_EDGE, MAX_UPLOAD_BYTES, fitWithin, tooBigMessage } from "./upload-limits";

describe("upload limits", () => {
  it("stays under the host's 4.5 MB a request, with room for the form", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4_500_000);
  });
  it("says what to do when a file is too big", () => {
    expect(tooBigMessage(6_200_000, true)).toBe("That PDF is 6.2 MB, and the most Atlas can take is 4.0 MB. Try screenshots of its pages instead.");
    expect(tooBigMessage(9_000_000, false)).toMatch(/9\.0 MB together.*Try fewer/);
  });
  it("shrinks a phone photo's longer side to the limit, and never enlarges", () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: MAX_IMAGE_EDGE });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
