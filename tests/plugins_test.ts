// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { freehandBehaviour } from "../src/app/plugins/builtin/freehand.ts";
import { handBehaviour } from "../src/app/plugins/builtin/hand.ts";
import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import {
  lineBehaviour,
  rectangleBehaviour,
} from "../src/app/plugins/builtin/shapes.ts";
import {
  allPlugins,
  enabledPlugins,
  optionalPlugins,
  pluginById,
  registerPlugin,
  resetPlugins,
  resolveActiveTool,
} from "../src/app/plugins/registry.ts";
import type { ToolContext } from "../src/app/plugins/types.ts";

// The plugin seam is the app's one extension point, so these tests pin the two
// things the rest of the app relies on: what the registry offers for a given
// settings blob, and that a tool behaviour turns a gesture into the stroke it
// claims to. Behaviours are pure (`start` / `move` / `end` take a draft and
// return one), so a whole gesture runs here with no DOM.

const ctx: ToolContext = {
  color: "#ef4444",
  size: 4,
  filled: false,
  background: "#ffffff",
};

describe("registry", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("keeps registration order", () => {
    expect(allPlugins().map((p) => p.id)).toEqual([
      "pencil",
      "eraser",
      "line",
      "rectangle",
      "ellipse",
      "hand",
      "arrow",
      "marker",
      "highlighter",
    ]);
  });

  it("offers the core tools with no plugins enabled", () => {
    expect(enabledPlugins([]).map((p) => p.id)).toEqual([
      "pencil",
      "eraser",
      "line",
      "rectangle",
      "ellipse",
      "hand",
    ]);
  });

  it("gives every tool a shortcut of its own", () => {
    const keys = allPlugins()
      .map((p) => p.shortcut)
      .filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("slots an enabled optional tool into registration order, not the end", () => {
    // `arrow` registers before `marker`, so enabling both must not order them
    // by when the user switched them on.
    expect(enabledPlugins(["marker", "arrow"]).map((p) => p.id)).toEqual([
      "pencil",
      "eraser",
      "line",
      "rectangle",
      "ellipse",
      "hand",
      "arrow",
      "marker",
    ]);
  });

  it("lists only the non-core plugins as optional", () => {
    expect(optionalPlugins().every((p) => !p.core)).toBe(true);
    expect(optionalPlugins().map((p) => p.id)).toEqual([
      "arrow",
      "marker",
      "highlighter",
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
    expect(allPlugins()[0]!.id).toBe("pencil");
    expect(pluginById("pencil")!.nameKey).toBe("tools.marker.name");
  });

  describe("resolveActiveTool", () => {
    it("keeps a tool that is offered", () => {
      expect(resolveActiveTool("ellipse", [])).toBe("ellipse");
      expect(resolveActiveTool("arrow", ["arrow"])).toBe("arrow");
    });

    it("falls back when the active tool was switched off", () => {
      expect(resolveActiveTool("arrow", [])).toBe("pencil");
    });

    it("falls back for a tool this build doesn't ship", () => {
      expect(resolveActiveTool("crayon", [])).toBe("pencil");
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
