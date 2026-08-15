// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  afterPaste,
  afterPeek,
  looking,
  pastedImage,
  tabEnabled,
  tabShown,
  type ClipboardSource,
} from "../src/app/clipboardSource.ts";
import { classifyClipboard } from "../src/app/clipboard.ts";
import { encodeStrokes } from "../src/app/strokeClipboard.ts";
import type { Stroke } from "../src/app/types.ts";

// The clipboard tab in New drawing, and the ranking of what one look at the
// clipboard turns up. Both are pure: the tab is a state machine with six states
// and two transitions, and the ranking takes clipboard entries rather than a
// clipboard, so neither needs a browser to pin.

const image = { src: "data:image/png;base64,AA", width: 640, height: 480 };

describe("the clipboard tab", () => {
  it("is dim, but there, while a free look is in flight", () => {
    const source: ClipboardSource = { kind: "looking" };
    expect(tabShown(source)).toBe(true);
    expect(tabEnabled(source)).toBe(false);
    expect(looking(source)).toBe(true);
  });

  it("goes away when a look nobody asked for found nothing", () => {
    const source = afterPeek(null);
    expect(source.kind).toBe("hidden");
    expect(tabShown(source)).toBe(false);
  });

  it("stays put when a look the user asked for found nothing", () => {
    const source = afterPaste(null);
    expect(source.kind).toBe("nothing");
    expect(tabShown(source)).toBe(true);
    // Pressable again: the answer sits where the button was, and the button is
    // still there to press.
    expect(tabEnabled(source)).toBe(true);
    expect(looking(source)).toBe(false);
  });

  it("offers the picture either look found", () => {
    for (const source of [afterPeek(image), afterPaste(image)]) {
      expect(tabShown(source)).toBe(true);
      expect(tabEnabled(source)).toBe(true);
      expect(pastedImage(source)).toBe(image);
    }
  });

  it("is pressable, and empty-handed, when we may not look unasked", () => {
    const source: ClipboardSource = { kind: "ask" };
    expect(tabShown(source)).toBe(true);
    expect(tabEnabled(source)).toBe(true);
    expect(pastedImage(source)).toBeNull();
  });

  it("spins while the look the user asked for is out", () => {
    const source: ClipboardSource = { kind: "reading" };
    expect(looking(source)).toBe(true);
    expect(pastedImage(source)).toBeNull();
  });
});

/** One clipboard entry, as `navigator.clipboard.read()` hands them over. */
function entry(contents: Record<string, string>) {
  return {
    types: Object.keys(contents),
    getType: (type: string) =>
      Promise.resolve(new Blob([contents[type] ?? ""], { type })),
  };
}

const stroke: Stroke = {
  id: "s1",
  tool: "pencil",
  size: 4,
  shape: { kind: "path", points: [{ x: 0, y: 0 }] },
};

describe("what one look at the clipboard turns up", () => {
  it("takes marks this app wrote over the words they are made of", async () => {
    const found = await classifyClipboard([
      entry({ "text/plain": encodeStrokes([stroke]) }),
    ]);
    expect(found?.kind).toBe("strokes");
  });

  it("takes words when that is all there is", async () => {
    const found = await classifyClipboard([entry({ "text/plain": "hello\n" })]);
    expect(found).toEqual({ kind: "text", text: "hello" });
  });

  it("is nothing when the clipboard holds nothing it can use", async () => {
    expect(await classifyClipboard([])).toBeNull();
    expect(
      await classifyClipboard([entry({ "text/plain": "  \n" })]),
    ).toBeNull();
    expect(
      await classifyClipboard([entry({ "application/pdf": "%PDF" })]),
    ).toBeNull();
  });
});
