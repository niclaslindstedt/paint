// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { pictureFacts } from "../src/app/settings/tabs.tsx";
import { IMAGE_TOOL_ID } from "../src/app/plugins/builtin/image.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";

// The Developer tab's picture readout — the instrument that settles, on the
// device where it is actually happening, whether a picture's pixels can land on
// the page's lattice at all.
//
// It exists because three rounds of this were argued from screenshots. A bitmap
// stored smaller than it is drawn is magnified before the view sees it, so its
// colour changes fall *inside* the pixel grid's cells instead of on their
// edges — which reads exactly like the grid being wrong, and is not. One number
// tells the two apart, so the number is on screen.

function picture(
  id: string,
  src: string,
  box: [number, number, number, number],
) {
  const [x, y, width, height] = box;
  return {
    id,
    tool: IMAGE_TOOL_ID,
    size: 1,
    shape: {
      kind: "image" as const,
      from: { x, y },
      to: { x: x + width, y: y + height },
      src,
    },
  } as Stroke;
}

function page(strokes: Stroke[]): Drawing {
  return {
    id: "d",
    name: "IMG_2136",
    width: 1179,
    height: 2556,
    strokes,
    createdAt: "2026-08-21T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
  } as Drawing;
}

/** A decode cache that knows exactly one bitmap's real size. */
const bitmaps = (sizes: Record<string, [number, number]>) => (src: string) => {
  const found = sizes[src];
  return found ? { naturalWidth: found[0], naturalHeight: found[1] } : null;
};

describe("pictureFacts", () => {
  it("reports 1.000 for a picture stored at the size it is drawn", () => {
    const facts = pictureFacts(
      page([picture("a", "data:image/png;base64,AAAA", [0, 0, 1179, 2556])]),
      bitmaps({ "data:image/png;base64,AAAA": [1179, 2556] }),
    );
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({
      stored: "1179×2556",
      placed: "1179×2556",
      ratio: "1.000",
      exact: true,
      kind: "png",
    });
  });

  it("catches the magnified picture that started all this", () => {
    // Stored 923 × 2000 by the old import cap, drawn at the file's own size:
    // one of the picture's pixels covers 1.277 of the page's, so its edges fall
    // between grid lines and the grid takes the blame.
    const facts = pictureFacts(
      page([picture("a", "data:image/png;base64,AAAA", [0, 0, 1179, 2556])]),
      bitmaps({ "data:image/png;base64,AAAA": [923, 2000] }),
    );
    expect(facts[0]).toMatchObject({
      stored: "923×2000",
      placed: "1179×2556",
      ratio: "1.277",
      exact: false,
    });
  });

  it("names the encoding, so a re-encoded import cannot hide", () => {
    // The other thing that only the device can answer: a phone that hands a
    // screenshot over as JPEG rather than as the PNG it was.
    const facts = pictureFacts(
      page([picture("a", "data:image/jpeg;base64,AAAA", [0, 0, 100, 100])]),
      bitmaps({ "data:image/jpeg;base64,AAAA": [100, 100] }),
    );
    expect(facts[0].kind).toBe("jpeg");
  });

  it("says so rather than lying while a bitmap is still decoding", () => {
    const facts = pictureFacts(
      page([picture("a", "data:image/png;base64,AAAA", [0, 0, 100, 100])]),
      () => null,
    );
    expect(facts[0]).toMatchObject({ stored: "…", ratio: "…", exact: false });
  });

  it("has nothing to say about a page with no pictures on it", () => {
    expect(pictureFacts(page([]), bitmaps({}))).toEqual([]);
    expect(pictureFacts(null)).toEqual([]);
  });
});
