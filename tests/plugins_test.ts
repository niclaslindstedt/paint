// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { dropperBehaviour } from "../src/app/plugins/builtin/dropper.ts";
import { fillBehaviour } from "../src/app/plugins/builtin/fill.ts";
import { freehandBehaviour } from "../src/app/plugins/builtin/freehand.ts";
import { handBehaviour } from "../src/app/plugins/builtin/hand.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import {
  lineBehaviour,
  rectangleBehaviour,
} from "../src/app/plugins/builtin/shapes.ts";
import {
  DEFAULT_TEXT_FONT,
  fontSpec,
  textBehaviour,
  textFont,
  textLines,
  textStroke,
  TEXT_TOOL_ID,
} from "../src/app/plugins/builtin/text.ts";
import {
  allPlugins,
  defaultEnabledPlugins,
  enabledPlugins,
  optionalPlugins,
  pluginById,
  registerPlugin,
  resetPlugins,
  resolveActiveTool,
  toolPlugins,
} from "../src/app/plugins/registry.ts";
import type { ToolContext } from "../src/app/plugins/types.ts";
import type { Point } from "../src/app/types.ts";

// The plugin seam is the app's one extension point, so these tests pin the two
// things the rest of the app relies on: what the registry offers for a given
// settings blob, and that a tool behaviour turns a gesture into the stroke it
// claims to. Behaviours are pure (`start` / `move` / `end` take a draft and
// return one), so a whole gesture runs here with no DOM.

const ctx: ToolContext = {
  color: "#ef4444",
  size: 4,
  // Nothing tuned: the dials a tool was left alone on are simply absent (see
  // `plugins/dials.ts`), so this is what every stroke in this file draws with.
  dials: {},
  filled: false,
  background: "#ffffff",
};

describe("registry", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("keeps registration order", () => {
    // Photoshop's column, top to bottom: sample, paint, erase, fill, type,
    // shapes, and the tool that moves the view last.
    expect(allPlugins().map((p) => p.id)).toEqual([
      "dropper",
      "pencil",
      "paintbrush",
      "airspray",
      "marker",
      "highlighter",
      "crayon",
      "calligraphy",
      "eraser",
      "filler",
      "text",
      "rectangle",
      "ellipse",
      "line",
      "arrow",
      "hand",
      // Registered, but never in the toolbar: the painter behind a dropped
      // image (see `toolPlugins`).
      "image",
    ]);
  });

  it("samples at the far left and pans at the far right", () => {
    const ids = toolPlugins().map((p) => p.id);
    expect(ids[0]).toBe("dropper");
    expect(ids[ids.length - 1]).toBe("hand");
  });

  it("keeps the eraser directly under the tools it undoes", () => {
    const ids = toolPlugins().map((p) => p.id);
    expect(ids[ids.indexOf("eraser") - 1]).toBe("calligraphy");
    expect(ids[ids.indexOf("eraser") + 1]).toBe("filler");
  });

  it("keeps a hidden plugin out of every list a user picks from", () => {
    const hidden = allPlugins()
      .filter((p) => p.hidden)
      .map((p) => p.id);
    expect(hidden).toEqual(["image"]);
    for (const id of hidden) {
      expect(toolPlugins().map((p) => p.id)).not.toContain(id);
      expect(optionalPlugins().map((p) => p.id)).not.toContain(id);
      expect(enabledPlugins([id]).map((p) => p.id)).not.toContain(id);
      expect(defaultEnabledPlugins()).not.toContain(id);
      // …but it is still resolvable, or a stroke drawn with it would lose its
      // painter and the picture would vanish from the page.
      expect(pluginById(id)).toBeDefined();
    }
  });

  it("never lands the canvas on a tool with no button", () => {
    expect(resolveActiveTool("image", [])).not.toBe("image");
  });

  it("offers only the core tools with nothing switched on", () => {
    expect(enabledPlugins([]).map((p) => p.id)).toEqual([
      "pencil",
      "eraser",
      "hand",
    ]);
  });

  it("opens on a paint program's toolbox and nothing else", () => {
    // What a first run finds: a nib, a brush, a rubber, a bucket, a dropper,
    // type and the three shapes — the tools anyone who has opened a paint
    // program already knows.
    expect(enabledPlugins(defaultEnabledPlugins()).map((p) => p.id)).toEqual([
      "dropper",
      "pencil",
      "paintbrush",
      "eraser",
      "filler",
      "text",
      "rectangle",
      "ellipse",
      "line",
      "hand",
    ]);
    // …and the media deliberately not: they are the app's own additions, and
    // they are one tap away in Settings → Tools.
    for (const id of [
      "airspray",
      "marker",
      "highlighter",
      "crayon",
      "calligraphy",
      "arrow",
    ]) {
      expect(defaultEnabledPlugins()).not.toContain(id);
    }
  });

  it("gives every tool a width of its own to open at", () => {
    // One number never suited all of them: 6 document pixels is a fine pencil
    // line, a starved airbrush and type too small to read. A tool without one
    // falls back to the middle of the shared row, which is only right for the
    // tools that have no nib at all.
    const sized = toolPlugins().filter((p) => p.defaultSize !== undefined);
    expect(sized.map((p) => p.id)).toContain("pencil");
    expect(pluginById("text")!.defaultSize).toBe(32);
    expect(pluginById("pencil")!.defaultSize).not.toBe(
      pluginById("eraser")!.defaultSize,
    );
    for (const plugin of sized) {
      expect(plugin.defaultSize).toBeGreaterThan(0);
    }
  });

  it("gives every tool a shortcut of its own", () => {
    const keys = allPlugins()
      .map((p) => p.shortcut)
      .filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("slots an enabled optional tool into registration order, not the end", () => {
    // `marker` registers before `arrow`, so enabling them the other way round
    // must not order the toolbar by when the user switched them on.
    expect(enabledPlugins(["arrow", "marker"]).map((p) => p.id)).toEqual([
      "pencil",
      "marker",
      "eraser",
      "arrow",
      "hand",
    ]);
  });

  it("lists only the non-core plugins as optional", () => {
    expect(optionalPlugins().every((p) => !p.core)).toBe(true);
    expect(optionalPlugins().map((p) => p.id)).toEqual([
      "dropper",
      "paintbrush",
      "airspray",
      "marker",
      "highlighter",
      "crayon",
      "calligraphy",
      "filler",
      "text",
      "rectangle",
      "ellipse",
      "line",
      "arrow",
    ]);
  });

  it("ignores an unknown enabled id", () => {
    expect(enabledPlugins(["nope"]).map((p) => p.id)).toEqual(
      enabledPlugins([]).map((p) => p.id),
    );
  });

  it("replaces a re-registered id in place", () => {
    const before = allPlugins().length;
    registerPlugin({
      ...pluginById("pencil")!,
      nameKey: "tools.marker.name",
    });
    expect(allPlugins()).toHaveLength(before);
    expect(allPlugins()[1]!.id).toBe("pencil");
    expect(pluginById("pencil")!.nameKey).toBe("tools.marker.name");
  });

  describe("resolveActiveTool", () => {
    it("keeps a tool that is offered", () => {
      expect(resolveActiveTool("eraser", [])).toBe("eraser");
      expect(resolveActiveTool("arrow", ["arrow"])).toBe("arrow");
    });

    it("falls back when the active tool was switched off", () => {
      expect(resolveActiveTool("arrow", [])).toBe("pencil");
    });

    it("falls back for a tool this build doesn't ship", () => {
      expect(resolveActiveTool("quill", [])).toBe("pencil");
    });

    it("never falls back onto a tool that leaves no mark", () => {
      // The dropper is the first tool in the toolbar and the hand is the last;
      // landing a stale settings blob on either would look exactly like a
      // canvas that has stopped working.
      expect(resolveActiveTool("quill", defaultEnabledPlugins())).toBe(
        "pencil",
      );
    });
  });
});

describe("freehand behaviour", () => {
  it("samples a gesture into a path", () => {
    const tool = freehandBehaviour();
    let draft = tool.start({ x: 0, y: 0 }, ctx)!;
    draft = tool.move(draft, { x: 10, y: 0 }, ctx);
    draft = tool.move(draft, { x: 20, y: 0 }, ctx);
    expect(draft.shape).toEqual({
      kind: "path",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
    });
  });

  it("drops samples too close to matter", () => {
    const tool = freehandBehaviour();
    let draft = tool.start({ x: 0, y: 0 }, ctx)!;
    draft = tool.move(draft, { x: 0.5, y: 0 }, ctx);
    if (draft.shape.kind !== "path") throw new Error("expected a path");
    expect(draft.shape.points).toHaveLength(1);
  });

  it("records the picked colour", () => {
    const draft = freehandBehaviour().start({ x: 0, y: 0 }, ctx)!;
    expect(draft.color).toBe("#ef4444");
  });

  it("records no colour when none was picked, so the mark follows the page", () => {
    const draft = freehandBehaviour().start(
      { x: 0, y: 0 },
      {
        ...ctx,
        color: null,
      },
    )!;
    expect(draft.color).toBeUndefined();
  });

  it("records no colour for a background-painting tool", () => {
    // The eraser must follow the page for good — pinning the page colour it
    // erased on would show as a stripe once the canvas theme flips.
    const draft = freehandBehaviour({ useBackground: true }).start(
      { x: 0, y: 0 },
      ctx,
    )!;
    expect(draft.color).toBeUndefined();
  });

  it("scales the nib and carries opacity", () => {
    const draft = freehandBehaviour({ sizeScale: 6, opacity: 0.35 }).start(
      { x: 0, y: 0 },
      ctx,
    )!;
    expect(draft.size).toBe(24);
    expect(draft.opacity).toBe(0.35);
  });
});

describe("hand behaviour", () => {
  it("begins no stroke, so a gesture can never reach the document", () => {
    expect(handBehaviour.start({ x: 10, y: 10 }, ctx)).toBeNull();
  });

  it("is the only tool that navigates, and it is core", () => {
    resetPlugins();
    registerBuiltinPlugins();
    const navigating = allPlugins().filter((p) => p.navigates);
    expect(navigating.map((p) => p.id)).toEqual(["hand"]);
    expect(navigating[0]!.core).toBe(true);
  });
});

describe("hardness", () => {
  it("is recorded only by the tools that advertise it", () => {
    resetPlugins();
    registerBuiltinPlugins();
    const soft = { ...ctx, dials: { hardness: 0.25 } };
    // The brush asks for it…
    expect(
      freehandBehaviour({ style: "brush", useHardness: true }).start(
        { x: 0, y: 0 },
        soft,
      )!.hardness,
    ).toBe(0.25);
    // …the pencil does not, so the dial can never re-edge a plain line.
    expect(freehandBehaviour().start({ x: 0, y: 0 }, soft)!.hardness).toBe(
      undefined,
    );
  });

  it("goes unrecorded at its default, so an untuned mark carries nothing", () => {
    // The dial rests at 1 and so does `strokeHardness`, which is what keeps a
    // page of ordinary brushwork the same document it was before dials.
    expect(
      freehandBehaviour({ style: "brush", useHardness: true }).start(
        { x: 0, y: 0 },
        ctx,
      )!.hardness,
    ).toBe(undefined);
  });

  it("is offered by exactly the tools whose painter reads it", () => {
    resetPlugins();
    registerBuiltinPlugins();
    expect(
      allPlugins()
        .filter((p) => p.dials?.some((d) => d.id === "hardness"))
        .map((p) => p.id),
    ).toEqual(["paintbrush", "airspray"]);
  });
});

describe("dropper", () => {
  it("begins no stroke — a sampled colour is not a mark", () => {
    expect(dropperBehaviour.start({ x: 4, y: 4 }, ctx)).toBeNull();
  });

  it("is the only tool that picks a colour, and it draws nothing", () => {
    resetPlugins();
    registerBuiltinPlugins();
    const picking = allPlugins().filter((p) => p.picksColor);
    expect(picking.map((p) => p.id)).toEqual(["dropper"]);
    expect(picking[0]!.behaviour.start({ x: 0, y: 0 }, ctx)).toBeNull();
  });
});

describe("text", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("begins no stroke — a caption is typed, not dragged", () => {
    expect(textBehaviour.start({ x: 4, y: 4 }, ctx)).toBeNull();
  });

  it("is the only tool whose mark is entered rather than drawn", () => {
    const typing = allPlugins().filter((p) => p.entersText);
    expect(typing.map((p) => p.id)).toEqual(["text"]);
    // The flag is what the canvas reads, so it must ride on a tool that draws
    // nothing: a press opens a caret, and no gesture can reach the document.
    expect(typing[0]!.behaviour.start({ x: 0, y: 0 }, ctx)).toBeNull();
  });

  it("brings its own scale, because a nib width is not a type size", () => {
    const text = pluginById("text")!;
    expect(text.sizes).toEqual([16, 24, 32, 48, 72]);
    expect(text.defaultSize).toBe(32);
  });

  it("files the words as one mark, at the point they were typed", () => {
    const stroke = textStroke(
      "hello",
      { x: 12, y: 30 },
      {
        color: "#ef4444",
        size: 48,
      },
    );
    expect(stroke.tool).toBe(TEXT_TOOL_ID);
    expect(stroke.size).toBe(48);
    expect(stroke.color).toBe("#ef4444");
    expect(stroke.shape).toEqual({
      kind: "text",
      at: { x: 12, y: 30 },
      text: "hello",
    });
  });

  it("keeps several lines in one stroke", () => {
    const stroke = textStroke(
      "two\nlines",
      { x: 0, y: 0 },
      {
        color: null,
        size: 32,
      },
    );
    if (stroke.shape.kind !== "text") throw new Error("expected a caption");
    expect(textLines(stroke.shape.text)).toEqual(["two", "lines"]);
  });

  it("records no colour when none was picked, so type follows the page", () => {
    const stroke = textStroke("x", { x: 0, y: 0 }, { color: null, size: 32 });
    expect(stroke.color).toBeUndefined();
  });

  it("records only the type styling that differs from the default", () => {
    const plain = textStroke(
      "x",
      { x: 0, y: 0 },
      {
        color: null,
        size: 32,
        font: DEFAULT_TEXT_FONT,
      },
    );
    // A caption set the way the tool opens serialises as small as it reads.
    expect(plain.shape).toEqual({
      kind: "text",
      at: { x: 0, y: 0 },
      text: "x",
    });

    const styled = textStroke(
      "x",
      { x: 0, y: 0 },
      {
        color: null,
        size: 32,
        font: "serif",
        bold: true,
        italic: true,
      },
    );
    if (styled.shape.kind !== "text") throw new Error("expected a caption");
    expect(styled.shape.font).toBe("serif");
    expect(styled.shape.bold).toBe(true);
    expect(styled.shape.italic).toBe(true);
  });

  it("builds the same font shorthand the entry box previews with", () => {
    expect(fontSpec({ size: 24, font: "mono" })).toBe(
      `400 24px ${textFont("mono").stack}`,
    );
    expect(fontSpec({ size: 24, bold: true, italic: true })).toBe(
      `italic 700 24px ${textFont(DEFAULT_TEXT_FONT).stack}`,
    );
  });

  it("falls back to the default face for one this build no longer ships", () => {
    // A caption never loses its words to a missing font.
    expect(textFont("blackletter").id).toBe(DEFAULT_TEXT_FONT);
  });
});

describe("clearing the page", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("is offered by exactly one tool, and that tool is always in the toolbar", () => {
    const clearing = allPlugins().filter((p) => p.clearsPage);
    expect(clearing.map((p) => p.id)).toEqual(["eraser"]);
    // Core, so no settings blob can leave the wipe unreachable — it is the only
    // way to it now that the header carries no bin.
    expect(clearing[0]!.core).toBe(true);
    expect(enabledPlugins([]).map((p) => p.id)).toContain("eraser");
  });

  it("is a variant of a tool, not a tool of its own", () => {
    // The flag rides on a tool that still draws: pressing the button holds an
    // eraser, and the wipe is the second thing that button offers.
    const eraser = pluginById("eraser")!;
    expect(eraser.behaviour.start({ x: 0, y: 0 }, ctx)).not.toBeNull();
    expect(eraser.usesBackground).toBe(true);
    // Nothing registers the action as a tool of its own, so it can never end up
    // in the toolbar, in Settings → Tools, or on a stroke's `tool` field.
    expect(toolPlugins().map((p) => p.id)).not.toContain("clear");
  });
});

describe("fill behaviour", () => {
  // A stand-in for the canvas's own probe: it answers with one square area,
  // whatever it is asked. The behaviour is pure over it, so the whole gesture
  // runs with no DOM.
  const square = [
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  ];
  const withProbe = (region: Point[][] | null): ToolContext => ({
    ...ctx,
    probe: { colorAt: () => "#123456", regionAt: () => region },
  });

  it("files the traced area as a vector stroke", () => {
    const draft = fillBehaviour.start({ x: 5, y: 5 }, withProbe(square))!;
    expect(draft.shape).toEqual({ kind: "region", contours: square });
    expect(draft.color).toBe("#ef4444");
  });

  it("records no colour when none was picked, so the fill follows the page", () => {
    const draft = fillBehaviour.start(
      { x: 5, y: 5 },
      { ...withProbe(square), color: null },
    )!;
    expect(draft.color).toBeUndefined();
  });

  it("begins nothing when there is no probe to ask", () => {
    expect(fillBehaviour.start({ x: 5, y: 5 }, ctx)).toBeNull();
  });

  it("begins nothing when the area traced to less than an outline", () => {
    const sliver = [
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ],
    ];
    expect(fillBehaviour.start({ x: 5, y: 5 }, withProbe(sliver))).toBeNull();
  });

  it("re-aims rather than extends when the press drags", () => {
    const draft = fillBehaviour.start({ x: 5, y: 5 }, withProbe(square))!;
    const elsewhere = [
      [
        { x: 20, y: 20 },
        { x: 30, y: 20 },
        { x: 30, y: 30 },
      ],
    ];
    const moved = fillBehaviour.move(
      draft,
      { x: 25, y: 25 },
      withProbe(elsewhere),
    );
    expect(moved.shape).toEqual({ kind: "region", contours: elsewhere });
  });

  it("keeps the area it had when the drag leaves the page", () => {
    const draft = fillBehaviour.start({ x: 5, y: 5 }, withProbe(square))!;
    expect(fillBehaviour.move(draft, { x: -9, y: -9 }, withProbe(null))).toBe(
      draft,
    );
  });
});

describe("shape behaviour", () => {
  it("recomputes from the anchor on every move", () => {
    let draft = lineBehaviour.start({ x: 5, y: 5 }, ctx)!;
    draft = lineBehaviour.move(draft, { x: 50, y: 5 }, ctx);
    draft = lineBehaviour.move(draft, { x: 80, y: 40 }, ctx);
    expect(draft.shape).toEqual({
      kind: "segment",
      from: { x: 5, y: 5 },
      to: { x: 80, y: 40 },
    });
  });

  it("discards a press that never moved", () => {
    const draft = lineBehaviour.start({ x: 5, y: 5 }, ctx)!;
    expect(lineBehaviour.end!(draft, ctx)).toBeNull();
  });

  it("keeps a real drag", () => {
    let draft = rectangleBehaviour.start({ x: 0, y: 0 }, ctx)!;
    draft = rectangleBehaviour.move(draft, { x: 40, y: 30 }, ctx);
    expect(rectangleBehaviour.end!(draft, ctx)).toBe(draft);
  });

  it("records the fill flag only for a tool that supports it", () => {
    const filledCtx = { ...ctx, filled: true };
    expect(rectangleBehaviour.start({ x: 0, y: 0 }, filledCtx)!.filled).toBe(
      true,
    );
    // The line tool passes no `supportsFill`, so the flag never reaches a
    // stroke that couldn't honour it.
    expect(lineBehaviour.start({ x: 0, y: 0 }, filledCtx)!.filled).toBe(
      undefined,
    );
  });
});
