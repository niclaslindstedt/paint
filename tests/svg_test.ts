// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { exportRegion } from "../src/app/export.ts";
import { primeImageCache, resetImageCache } from "../src/app/images.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import { TEXT_LINE_HEIGHT } from "../src/app/plugins/builtin/text.ts";
import { allPlugins, resetPlugins } from "../src/app/plugins/registry.ts";
import type {
  CanvasProbe,
  PaintPlugin,
  ToolContext,
} from "../src/app/plugins/types.ts";
import { renderDrawing } from "../src/app/render.ts";
import { asContext2D, SvgCanvas } from "../src/app/svg.ts";
import type { Drawing, Stroke } from "../src/app/types.ts";

// The SVG export is the shared renderer painting into a recording context, so
// what these tests really pin is that the recording context is a good enough
// canvas for the tool painters — every stroke has to come out as an element,
// and the file has to be well-formed whatever the document holds.

const ink = { pageColor: "#ffffff", defaultInk: "#111827" };

const drawing = (strokes: Stroke[]): Drawing => ({
  id: "d1",
  name: "sketch",
  width: 400,
  height: 300,
  strokes,
});

/** A page that answers the two tools which read one (the bucket, the dropper),
 *  so a whole gesture can be driven with no canvas behind it. */
const probe: CanvasProbe = {
  colorAt: () => "#ffffff",
  regionAt: () => [
    [
      { x: 20, y: 20 },
      { x: 120, y: 20 },
      { x: 120, y: 90 },
      { x: 20, y: 90 },
    ],
  ],
};

/** One gesture with `plugin`, committed — or `null` for a tool that leaves no
 *  mark. */
function drawnWith(plugin: PaintPlugin): Stroke | null {
  const ctx: ToolContext = {
    color: "#ef4444",
    size: 8,
    // Every tool tuned off its rest, so the export is exercised with the dials
    // actually recorded on a mark rather than with a bare stroke.
    dials: {
      hardness: 0.5,
      opacity: 0.8,
      hair: 1.4,
      flow: 1.5,
      pressure: 1.2,
      feather: 6,
    },
    filled: true,
    background: "#ffffff",
    probe,
  };
  let draft = plugin.behaviour.start({ x: 20, y: 20 }, ctx);
  if (!draft) return null;
  for (const at of [
    { x: 70, y: 45 },
    { x: 130, y: 90 },
  ]) {
    draft = plugin.behaviour.move(draft, at, ctx);
  }
  const done = plugin.behaviour.end ? plugin.behaviour.end(draft, ctx) : draft;
  // The canvas stamps the tool's id onto the draft it commits; without it the
  // renderer would fall back to its generic painter and this would test
  // nothing.
  return done ? { ...done, tool: plugin.id, id: "s1" } : null;
}

function toSvg(doc: Drawing, transparentPage = false): string {
  const recorder = new SvgCanvas();
  renderDrawing(asContext2D(recorder), doc, null, { ...ink, transparentPage });
  return recorder.toSvg(exportRegion(doc, "page"));
}

beforeEach(() => {
  resetPlugins();
  registerBuiltinPlugins();
  resetImageCache();
});

describe("the SVG export", () => {
  it("frames the page it was asked for", () => {
    const svg = toSvg(drawing([]));
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" ')).toBe(
      true,
    );
    expect(svg).toContain('viewBox="0 0 400 300"');
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("paints the page colour as a rectangle behind the marks", () => {
    expect(toSvg(drawing([]))).toContain('fill="#ffffff"');
  });

  it("leaves the page out when the export is transparent", () => {
    expect(toSvg(drawing([]), true)).not.toContain('fill="#ffffff"');
  });

  it("leaves the page out when the background layer is hidden", () => {
    // The sheet is the background layer's to paint, so its eye switches the
    // page colour off exactly as a transparent export does.
    const page = drawing([]);
    expect(
      toSvg({
        ...page,
        layers: [
          { id: "background", name: "", locked: true, hidden: true },
          { id: "base", name: "" },
        ],
      }),
    ).not.toContain('fill="#ffffff"');
  });

  it("writes a freehand gesture as a path with the ink on it", () => {
    const svg = toSvg(
      drawing([
        {
          id: "s1",
          tool: "pencil",
          color: "#ef4444",
          size: 8,
          shape: {
            kind: "path",
            points: [
              { x: 10, y: 10 },
              { x: 40, y: 30 },
              { x: 80, y: 10 },
            ],
          },
        },
      ]),
    );
    expect(svg).toContain('stroke="#ef4444"');
    expect(svg).toContain('stroke-width="8"');
    expect(svg).toMatch(/<path d="M10 10/);
  });

  it("inks a stroke that never picked a colour with the page's default", () => {
    const svg = toSvg(
      drawing([
        {
          id: "s1",
          tool: "line",
          size: 2,
          shape: {
            kind: "segment",
            from: { x: 0, y: 0 },
            to: { x: 10, y: 10 },
          },
        },
      ]),
    );
    expect(svg).toContain('stroke="#111827"');
  });

  it("carries a dropped image along inside the file", () => {
    const src = "data:image/png;base64,AAAA";
    primeImageCache(src, { src } as unknown as HTMLImageElement);
    const svg = toSvg(
      drawing([
        {
          id: "s1",
          tool: "image",
          size: 1,
          shape: {
            kind: "image",
            from: { x: 20, y: 30 },
            to: { x: 120, y: 130 },
            src,
          },
        },
      ]),
    );
    expect(svg).toContain(
      `<image x="20" y="30" width="100" height="100" preserveAspectRatio="none" href="${src}"`,
    );
  });

  it("sets a caption in its own face, hung from its top edge", () => {
    // A canvas anchors text wherever `textBaseline` says; an SVG `<text>`
    // always on the alphabetic baseline. Without the crossing-over below,
    // every exported caption would sit a line higher than it did on screen.
    const svg = toSvg(
      drawing([
        {
          id: "s1",
          tool: "text",
          size: 32,
          color: "#111827",
          shape: {
            kind: "text",
            at: { x: 40, y: 60 },
            text: "two\nlines",
            font: "serif",
            bold: true,
          },
        },
      ]),
    );
    expect(svg).toContain('dominant-baseline="text-before-edge"');
    expect(svg).toContain("700 32px");
    expect(svg).toContain("Georgia");
    // One `<text>` per line, the second one a line further down the page.
    expect(svg).toContain('y="60"');
    expect(svg).toContain(`y="${32 * TEXT_LINE_HEIGHT + 60}"`);
  });

  it("escapes document text rather than emitting a broken file", () => {
    const svg = toSvg(
      drawing([
        {
          id: "s1",
          tool: "unknown-tool",
          size: 4,
          color: '#fff" onload="boom',
          shape: { kind: "text", at: { x: 10, y: 20 }, text: "a & b <c>" },
        },
      ]),
    );
    expect(svg).toContain("a &amp; b &lt;c&gt;");
    expect(svg).not.toContain('onload="boom"');
    expect(svg).toContain("&quot;");
  });

  it("draws every tool this build ships", () => {
    // The recorder carries a *subset* of the 2D API, so a painter that reaches
    // for something outside it would throw — or worse, silently drop its mark
    // from the file. Running one gesture per registered tool through it is what
    // keeps that from being discovered in a download.
    const blank = toSvg(drawing([])).length;
    for (const plugin of allPlugins()) {
      const gesture = drawnWith(plugin);
      // The tools that leave no mark (the hand, the dropper, the image
      // painter) begin no stroke — there is nothing to export.
      if (!gesture) continue;
      const svg = toSvg(drawing([gesture]));
      expect(svg.length, `${plugin.id} painted nothing`).toBeGreaterThan(blank);
    }
  });

  it("keeps a translucent mark translucent", () => {
    const svg = toSvg(
      drawing([
        {
          id: "s1",
          tool: "highlighter",
          size: 24,
          opacity: 0.35,
          shape: {
            kind: "path",
            points: [
              { x: 0, y: 0 },
              { x: 50, y: 0 },
            ],
          },
        },
      ]),
    );
    expect(svg).toContain('opacity="0.35"');
  });
});
