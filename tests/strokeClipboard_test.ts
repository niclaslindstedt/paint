// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  decodeStrokes,
  encodeStrokes,
  isStrokeClip,
  STROKE_CLIP_PREFIX,
} from "../src/app/strokeClipboard.ts";
import type { Stroke } from "../src/app/types.ts";

// Copied marks travel on the *system* clipboard, as text behind a marker this
// app recognises — which is what makes copy-here-paste-there work across tabs
// and across reloads, and what means everything coming back has to be checked
// as though a stranger wrote it. Because one might have.

const mark = (over: Partial<Stroke> = {}): Stroke => ({
  id: "stroke-1",
  tool: "pencil",
  size: 4,
  shape: {
    kind: "path",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
  },
  ...over,
});

describe("encodeStrokes", () => {
  it("wears the marker a paste looks for", () => {
    const text = encodeStrokes([mark()]);
    expect(text.startsWith(STROKE_CLIP_PREFIX)).toBe(true);
    expect(isStrokeClip(text)).toBe(true);
    expect(isStrokeClip("just some words")).toBe(false);
  });

  it("drops the id and the layer — a pasted mark is a new mark", () => {
    const text = encodeStrokes([mark({ layer: "layer-2" })]);
    expect(text).not.toContain("stroke-1");
    expect(text).not.toContain("layer-2");
  });

  it("carries the ink a mark was drawn with", () => {
    const marks = decodeStrokes(
      encodeStrokes([
        mark({
          color: "#ef4444",
          opacity: 0.35,
          hardness: 0.5,
          filled: true,
          dials: { flow: 0.4 },
        }),
      ]),
    )!;
    expect(marks[0]).toMatchObject({
      tool: "pencil",
      size: 4,
      color: "#ef4444",
      opacity: 0.35,
      hardness: 0.5,
      filled: true,
      dials: { flow: 0.4 },
    });
  });

  it("round-trips every shape kind the app draws", () => {
    const shapes: Stroke["shape"][] = [
      { kind: "path", points: [{ x: 1, y: 2 }] },
      { kind: "segment", from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
      { kind: "box", from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
      { kind: "region", contours: [[{ x: 0, y: 0 }]] },
      // A poured area carries its ramp: the run across the page, and every
      // colour on it. Without them a gradient pasted into another sketchbook
      // would arrive as a flat fill.
      {
        kind: "region",
        contours: [[{ x: 0, y: 0 }]],
        gradient: {
          from: { x: 0, y: 0 },
          to: { x: 10, y: 4 },
          stops: [
            { at: 0, color: "#111827" },
            { at: 1, color: "#ffffff" },
          ],
        },
      },
      { kind: "text", at: { x: 2, y: 2 }, text: "hi", font: "serif" },
      {
        kind: "image",
        from: { x: 0, y: 0 },
        to: { x: 4, y: 4 },
        src: "data:image/png;base64,x",
      },
      // How a bitmap is sampled travels with it: a piece of pixel art pasted
      // somewhere else is still pixel art.
      {
        kind: "image",
        from: { x: 0, y: 0 },
        to: { x: 4, y: 4 },
        src: "data:image/png;base64,x",
        smoothing: "nearest",
      },
    ];
    for (const shape of shapes) {
      const back = decodeStrokes(encodeStrokes([mark({ shape })]))!;
      expect(back[0]!.shape).toEqual(shape);
    }
  });

  it("leaves a remote bitmap's file reference behind", () => {
    // `srcPath` names a file beside one particular backend's document, so a
    // paste into another sketchbook would point at nothing. Only inlined bytes
    // travel — and a stroke with no bytes at all doesn't.
    const back = decodeStrokes(
      encodeStrokes([
        mark({
          shape: {
            kind: "image",
            from: { x: 0, y: 0 },
            to: { x: 4, y: 4 },
            srcPath: "images/a.png",
          },
        }),
      ]),
    );
    expect(back).toBeNull();
  });
});

describe("decodeStrokes", () => {
  it("ignores text this app didn't write", () => {
    expect(decodeStrokes("hello")).toBeNull();
    expect(decodeStrokes("")).toBeNull();
  });

  it("refuses a payload it can't parse", () => {
    expect(decodeStrokes(`${STROKE_CLIP_PREFIX}{oops`)).toBeNull();
    expect(decodeStrokes(`${STROKE_CLIP_PREFIX}null`)).toBeNull();
    expect(decodeStrokes(`${STROKE_CLIP_PREFIX}{"v":1}`)).toBeNull();
  });

  it("refuses a payload from a version it doesn't know", () => {
    expect(
      decodeStrokes(`${STROKE_CLIP_PREFIX}{"v":99,"strokes":[]}`),
    ).toBeNull();
  });

  it("drops a mark that isn't one, and keeps the rest", () => {
    // Anything at all can be put behind our marker, and a half-copied string is
    // one paste away from a page that won't render.
    const good = JSON.parse(
      encodeStrokes([mark()]).slice(STROKE_CLIP_PREFIX.length),
    ) as { strokes: unknown[] };
    const text = `${STROKE_CLIP_PREFIX}${JSON.stringify({
      v: 1,
      strokes: [
        ...good.strokes,
        { tool: "pencil" },
        { tool: "pencil", size: 0, shape: { kind: "path", points: [] } },
        { tool: "pencil", size: 4, shape: { kind: "sorcery" } },
        {
          tool: "pencil",
          size: 4,
          shape: { kind: "path", points: [{ x: 1 }] },
        },
        null,
      ],
    })}`;
    const back = decodeStrokes(text)!;
    expect(back).toHaveLength(1);
    expect(back[0]!.tool).toBe("pencil");
  });

  it("comes back null when nothing survived", () => {
    expect(
      decodeStrokes(`${STROKE_CLIP_PREFIX}{"v":1,"strokes":[{}]}`),
    ).toBeNull();
  });
});
