// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { beforeEach, describe, expect, it } from "vitest";

import { hexToHsv } from "../src/app/color.ts";
import { dropperBehaviour } from "../src/app/plugins/builtin/dropper.ts";
import { fillBehaviour } from "../src/app/plugins/builtin/fill.ts";
import { freehandBehaviour } from "../src/app/plugins/builtin/freehand.ts";
import { handBehaviour } from "../src/app/plugins/builtin/hand.ts";
import {
  ERASER_GROUP_ID,
  registerBuiltinPlugins,
} from "../src/app/plugins/builtin/index.ts";
import {
  selectBehaviour,
  selectLassoBehaviour,
  selectOvalBehaviour,
  selectTraceBehaviour,
  SELECT_GROUP_ID,
} from "../src/app/plugins/builtin/select.ts";
import {
  hexagonBehaviour,
  lineBehaviour,
  rectangleBehaviour,
  SHAPES_GROUP_ID,
  starBehaviour,
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
  groupById,
  groupMembers,
  orderEntries,
  pluginById,
  registeredEntries,
  registerPlugin,
  resetPlugins,
  resolveActiveTool,
  toolbarEntries,
  toolPlugins,
  type ToolbarEntry,
} from "../src/app/plugins/registry.ts";
import { gaugeSizes, isRealSize } from "../src/app/plugins/gauge.ts";
import { graphiteInk } from "../src/app/plugins/graphite.ts";
import { polygonCorners, starCorners } from "../src/app/plugins/ink.ts";
import type { ToolContext } from "../src/app/plugins/types.ts";
import type { Point } from "../src/app/types.ts";
import { toMm, toPt } from "../src/app/units.ts";
import { gaugeFor } from "../src/app/useAppSettings.ts";

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
    // The row a hand actually uses: the pen, the rest of the media, then the
    // three tools that work on an area rather than on a line — the two rubbers
    // and the two fills — then the two other families, type, and last the two
    // tools that touch neither the ink nor the document.
    expect(allPlugins().map((p) => p.id)).toEqual([
      "pencil",
      "graphite",
      "paintbrush",
      "flatbrush",
      "watercolor",
      "airspray",
      "marker",
      "highlighter",
      "crayon",
      "chalk",
      "calligraphy",
      "eraser",
      "rubber",
      "filler",
      // …and its variant, which shares the bucket's button: same area, poured
      // from a ramp instead of one flat colour.
      "gradient",
      // The shapes: four a paint program has always had, then the ones a
      // diagram wants. They share a button, not a registration.
      "rectangle",
      "ellipse",
      "line",
      "arrow",
      "roundrect",
      "triangle",
      "diamond",
      "pentagon",
      "hexagon",
      "star",
      "doublearrow",
      // The selection family: the box marquee, then the oval, the lasso and
      // the one that traces what is painted. They share a button too.
      "select",
      "select-oval",
      "select-lasso",
      "select-trace",
      "text",
      "dropper",
      "hand",
      // Registered, but never in the toolbar: the painter behind a dropped
      // image (see `toolPlugins`).
      "image",
    ]);
  });

  it("draws at the near end and leaves the marks alone at the far one", () => {
    const ids = toolPlugins().map((p) => p.id);
    expect(ids[0]).toBe("pencil");
    // The two that touch neither the ink nor the document, together, last.
    expect(ids.slice(-2)).toEqual(["dropper", "hand"]);
  });

  it("keeps the eraser beside the bucket rather than in the media", () => {
    // Taking a passage off and flooding one are the same kind of act — both
    // work on an *area* — so the erasers sit at the end of the media shelf,
    // one button left of the fills, and a hand picking through the marking
    // tools runs along them without stepping over the one that takes marks
    // away.
    const ids = toolPlugins().map((p) => p.id);
    expect(ids[ids.indexOf("eraser") - 1]).toBe("calligraphy");
    expect(ids[ids.indexOf("rubber") + 1]).toBe("filler");
  });

  it("puts type straight after the marquee", () => {
    const ids = toolbarEntries(defaultEnabledPlugins(), []).map((e) => e.id);
    expect(ids[ids.indexOf("text") - 1]).toBe(SELECT_GROUP_ID);
  });

  it("keeps a hidden plugin out of every list a user picks from", () => {
    const hidden = allPlugins()
      .filter((p) => p.hidden)
      .map((p) => p.id);
    // The dropped image, and the flat brush the paintbrush's flatness dial
    // replaced — kept registered so every stroke ever drawn with it still
    // paints, offered nowhere because the paintbrush is how a flat is picked
    // up now.
    expect(hidden).toEqual(["flatbrush", "image"]);
    for (const id of hidden) {
      expect(toolPlugins().map((p) => p.id)).not.toContain(id);
      expect(registeredEntries().map((e) => e.id)).not.toContain(id);
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
    // Four plugins behind three buttons: the two ways of rubbing out share
    // theirs, and a core *family* is offered exactly as a core tool is.
    expect(enabledPlugins([]).map((p) => p.id)).toEqual([
      "pencil",
      "eraser",
      "rubber",
      "hand",
    ]);
  });

  it("opens on a paint program's toolbox and nothing else", () => {
    // What a first run finds: a pen, a marker, a highlighter, a spray can, a
    // rubber, a bucket, the shapes, the marquee, type, a dropper and the hand —
    // the tools anyone who has opened a paint program already knows, plus the
    // two felt tips a hand reaches for on a page it is thinking on. This list
    // is the whole default toolbar, families counted as the one button they
    // are, so a tool added later has to be switched on before it is seen.
    expect(
      toolbarEntries(defaultEnabledPlugins(), []).map((e) => e.id),
    ).toEqual([
      "pencil",
      "airspray",
      "marker",
      "highlighter",
      "eraser",
      "filler",
      "shapes",
      "select",
      "text",
      "dropper",
      "hand",
    ]);
    // …and the media that simulate their medium deliberately not: they are the
    // app's own additions, and they are one tap away in Settings → Tools.
    for (const id of [
      "graphite",
      "watercolor",
      "paintbrush",
      "flatbrush",
      "crayon",
      "calligraphy",
    ]) {
      expect(defaultEnabledPlugins()).not.toContain(id);
    }
  });

  it("spends one toolbar button on a whole family", () => {
    // Grouping is what keeps the toolbar the size it is: fifteen tools behind
    // the two family buttons, and one switch each in Settings → Tools.
    const entries = toolbarEntries(defaultEnabledPlugins(), []);
    for (const id of [SHAPES_GROUP_ID, SELECT_GROUP_ID, ERASER_GROUP_ID]) {
      expect(entries.filter((e) => e.id === id)).toHaveLength(1);
      const members = groupMembers(id);
      expect(members.length).toBeGreaterThan(1);
      for (const member of members) {
        // The box marquee's plugin id *is* the family's id — that is what
        // carries an old settings blob into the group — so it is the one
        // member allowed to share the entry's name.
        if (member.id === id) continue;
        expect(entries.map((e) => e.id)).not.toContain(member.id);
      }
    }
  });

  it("gives every tool a width of its own to open at", () => {
    // One number never suited all of them: a third of a millimetre is a fine
    // pen line, a starved airbrush and type too small to read. A tool without
    // one falls back to the middle of the default ladder, which is only right
    // for the tools that have no nib at all.
    const sized = toolPlugins().filter((p) => p.defaultSize !== undefined);
    expect(sized.map((p) => p.id)).toContain("pencil");
    expect(Math.round(toPt(pluginById("text")!.defaultSize!))).toBe(12);
    expect(pluginById("pencil")!.defaultSize).not.toBe(
      pluginById("eraser")!.defaultSize,
    );
    for (const plugin of sized) {
      expect(plugin.defaultSize).toBeGreaterThan(0);
    }
  });

  it("opens every tool on a width it is really made in", () => {
    // The whole point of a gauge: the width a tool opens at is a size a shop
    // sells, not a number somebody liked. A default off the rack is a tool
    // whose first mark is one no implement makes.
    for (const plugin of toolPlugins()) {
      if (plugin.defaultSize === undefined) continue;
      expect(isRealSize(gaugeFor(plugin), plugin.defaultSize)).toBe(true);
    }
  });

  it("gives every tool a shortcut of its own", () => {
    const keys = allPlugins()
      .map((p) => p.shortcut)
      .filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("slots an enabled optional tool into registration order, not the end", () => {
    // `marker` registers before `select`, so enabling them the other way round
    // must not order the toolbar by when the user switched them on.
    expect(toolbarEntries(["select", "marker"], []).map((e) => e.id)).toEqual([
      "pencil",
      "marker",
      "eraser",
      "select",
      "hand",
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
      expect(resolveActiveTool("eraser", [])).toBe("eraser");
      expect(resolveActiveTool("marker", ["marker"])).toBe("marker");
    });

    it("falls back when the active tool was switched off", () => {
      expect(resolveActiveTool("marker", [])).toBe("pencil");
    });

    it("falls back for a tool this build doesn't ship", () => {
      expect(resolveActiveTool("quill", [])).toBe("pencil");
    });

    it("never falls back onto a tool that leaves no mark", () => {
      // The dropper is the first tool in the toolbar, the hand is the last and
      // the marquee draws nothing either; landing a stale settings blob on any
      // of them would look exactly like a canvas that has stopped working.
      expect(resolveActiveTool("quill", defaultEnabledPlugins())).toBe(
        "pencil",
      );
    });
  });
});

describe("tool groups", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("offers the shapes as one button and one switch", () => {
    const entries = registeredEntries();
    const shapes = entries.find((e) => e.id === SHAPES_GROUP_ID);
    expect(shapes?.kind).toBe("group");
    // Eleven plugins, one row: the whole point of grouping them.
    expect(
      entries.filter((e) => e.kind === "tool" && e.plugin.group).length,
    ).toBe(0);
    expect(groupMembers(SHAPES_GROUP_ID).map((p) => p.id)).toEqual([
      "rectangle",
      "ellipse",
      "line",
      "arrow",
      "roundrect",
      "triangle",
      "diamond",
      "pentagon",
      "hexagon",
      "star",
      "doublearrow",
    ]);
  });

  it("sits where its first member registered, not where the group was declared", () => {
    const ids = registeredEntries().map((e) => e.id);
    expect(ids[ids.indexOf(SHAPES_GROUP_ID) - 1]).toBe("filler");
    expect(ids[ids.indexOf(SHAPES_GROUP_ID) + 1]).toBe("select");
  });

  it("switches the whole family with one id", () => {
    // Off: not one shape is offered, however its own descriptor reads.
    const off = enabledPlugins([]).map((p) => p.id);
    for (const id of groupMembers(SHAPES_GROUP_ID).map((p) => p.id)) {
      expect(off).not.toContain(id);
    }
    // On: all eleven, and the group id is the only thing that had to be said.
    const on = enabledPlugins([SHAPES_GROUP_ID]).map((p) => p.id);
    for (const id of groupMembers(SHAPES_GROUP_ID).map((p) => p.id)) {
      expect(on).toContain(id);
    }
    // A member's own id switches nothing: it is not what the settings blob
    // holds any more, and an install upgrading from one that did must not have
    // half a family in its toolbar.
    expect(enabledPlugins(["rectangle"]).map((p) => p.id)).not.toContain(
      "rectangle",
    );
  });

  it("keeps every member's own id, so nothing already drawn is orphaned", () => {
    // A stroke records the plugin that drew it. Merging the buttons must not
    // rename one, or every rectangle ever drawn loses its painter.
    for (const id of ["rectangle", "ellipse", "line", "arrow"]) {
      expect(pluginById(id)).toBeDefined();
      expect(pluginById(id)!.group).toBe(SHAPES_GROUP_ID);
    }
    expect(groupById(SHAPES_GROUP_ID)?.defaultOn).toBe(true);
  });
});

describe("toolbar order", () => {
  const entry = (id: string) =>
    ({ kind: "tool", id, plugin: { id } }) as unknown as ToolbarEntry;
  const entries = ["a", "b", "c", "d"].map(entry);
  const ids = (list: readonly ToolbarEntry[]) => list.map((e) => e.id);

  it("leaves an untouched toolbar in registration order", () => {
    expect(ids(orderEntries(entries, []))).toEqual(["a", "b", "c", "d"]);
  });

  it("reorders the entries the order names", () => {
    expect(ids(orderEntries(entries, ["d", "c", "b", "a"]))).toEqual([
      "d",
      "c",
      "b",
      "a",
    ]);
  });

  it("keeps an entry the order has never heard of where it registered", () => {
    // The case that matters: an order written before `c` shipped must not push
    // `c` to the end of the toolbar — its maker put it third, and it stays
    // third while the rows that *were* reordered fill the slots around it.
    expect(ids(orderEntries(entries, ["d", "b", "a"]))).toEqual([
      "d",
      "b",
      "c",
      "a",
    ]);
  });

  it("ignores ids for entries this build doesn't ship", () => {
    expect(ids(orderEntries(entries, ["c", "gone", "a"]))).toEqual([
      "c",
      "b",
      "a",
      "d",
    ]);
  });

  it("survives a duplicated id", () => {
    const out = ids(orderEntries(entries, ["b", "b", "a"]));
    expect(out).toHaveLength(entries.length);
    expect(new Set(out).size).toBe(entries.length);
  });

  it("carries the order into the toolbar, and only for what is switched on", () => {
    resetPlugins();
    registerBuiltinPlugins();
    const order = ["hand", "pencil", "eraser"];
    expect(toolbarEntries([], order).map((e) => e.id)).toEqual([
      "hand",
      "pencil",
      "eraser",
    ]);
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

  it("records no colour for a tool that lifts ink", () => {
    // The eraser takes ink off by where the nib went, not by what the toolbar
    // was holding — a colour on the mark would be a number nothing ever reads.
    const draft = freehandBehaviour({ erases: true }).start(
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

describe("the pencil", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("mixes its own grey and ignores the ink you picked", () => {
    // Graphite is a mineral. A pencil that drew in red would be a textured pen.
    const draft = pluginById("graphite")!.behaviour.start({ x: 0, y: 0 }, ctx)!;
    expect(draft.color).not.toBe(ctx.color);
    expect(draft.color).toBe(graphiteInk(ctx.background));
  });

  it("takes that grey from the lead that is in it", () => {
    // The one control a pencil's colour has, and it is not a palette: a hard
    // lead scratches a pale line, a soft one goes down nearly black.
    const drawnWith = (grade: number) =>
      pluginById("graphite")!.behaviour.start(
        { x: 0, y: 0 },
        { ...ctx, dials: { grade } },
      )!.color!;
    expect(hexToHsv(drawnWith(0.38)).v).toBeGreaterThan(
      hexToHsv(drawnWith(1.9)).v,
    );
    // …and an untouched dial is the HB, which is what a pencil drawn with
    // before the lead reached the colour was toned as.
    expect(drawnWith(1)).toBe(graphiteInk(ctx.background));
  });

  it("offers nowhere to pick a colour at all", () => {
    // Not the toolbar's ink (`fixedInk` strikes that button through) and not a
    // swatch row of its own either — the grade *is* the colour control.
    const graphite = pluginById("graphite")!;
    expect(graphite.fixedInk).toBe(true);
    expect(graphite.swatches).toBeUndefined();
  });

  it("records the grey it drew in, so a repaint cannot re-tone it", () => {
    // The colour is chosen against the page *once*, at the moment of drawing.
    // Recording it is what keeps a sketch the tone it was made in when the
    // page it sits on is later changed.
    const onDark = pluginById("graphite")!.behaviour.start(
      { x: 0, y: 0 },
      { ...ctx, background: "#111827" },
    )!;
    expect(onDark.color).toBe(graphiteInk("#111827"));
    expect(onDark.color).not.toBe(graphiteInk("#ffffff"));
  });

  it("is the only tool in the box that will not take the toolbar's ink", () => {
    const ignoring = toolPlugins().filter((plugin) => {
      if (plugin.navigates || plugin.picksColor || plugin.selects) return false;
      const draft = plugin.behaviour.start({ x: 0, y: 0 }, ctx);
      return Boolean(draft) && draft!.color !== undefined
        ? draft!.color !== ctx.color
        : false;
    });
    expect(ignoring.map((p) => p.id)).toEqual(["graphite"]);
  });

  it("keeps the pen's id, whatever the two of them are called", () => {
    // The plain-line tool is named "Pen" now and the pencil is a different
    // tool — but an id is persisted on every stroke ever drawn, so the one
    // that moved was the name.
    expect(pluginById("pencil")!.nameKey).toBe("tools.pencil.name");
    expect(pluginById("pencil")!.core).toBe(true);
    expect(pluginById("graphite")!.nameKey).toBe("tools.graphite.name");
  });
});

describe("the felt tips", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("tells the marker from the highlighter by shape, not just by width", () => {
    // They used to be the same round painter twice, differing in a width and
    // an opacity. A chisel is what makes a highlighter a highlighter.
    const chiselOf = (id: string) =>
      pluginById(id)!.dials!.find((d) => d.id === "chisel");
    expect(chiselOf("marker")!.default).toBeLessThan(0.5);
    expect(chiselOf("highlighter")!.default).toBeGreaterThan(0.5);
  });

  it("opens the marker at a tip you could write with", () => {
    // It used to open eighteen document pixels wide, which is a wall marker.
    const marker = pluginById("marker")!;
    const draft = marker.behaviour.start({ x: 0, y: 0 }, ctx)!;
    // The two-millimetre bullet: the tip on the marker in everybody's drawer,
    // and the one it spends its life on.
    expect(toMm(marker.defaultSize!)).toBeCloseTo(2, 6);
    // …and the nib painter lays a mark exactly as wide as it is told, so the
    // number on the button is the mark.
    expect(draft.size).toBe(ctx.size);
    // Spirit ink: a second pass over the same line darkens it.
    expect(draft.opacity).toBeLessThan(1);
  });

  it("lets a broad nib be turned, and only the tools that have one", () => {
    const angled = toolPlugins()
      .filter((p) => p.dials?.some((d) => d.id === "angle"))
      .map((p) => p.id);
    // The paintbrush and the broad nib: the two tools in the box that can
    // have a flat on them, and the only two for which "which way is it
    // turned" is a question — the brush's means nothing until its flatness
    // dial leaves the round.
    expect(angled).toEqual(["paintbrush", "calligraphy"]);
    const angle = pluginById("calligraphy")!.dials!.find(
      (d) => d.id === "angle",
    )!;
    // Degrees, because that is what a tilt reads as — the one dial here that
    // is neither a fraction nor a distance.
    expect(angle.unit).toBe("deg");
    expect(angle.default).toBe(-45);
  });
});

describe("the airbrush's width", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("means what it means on every other tool", () => {
    // It used to take its number times three and spread a cone over 1.6 times
    // that — a spray set to 8 came out nearly five times as wide as a pen set
    // to 8. The cone is now about as wide as the nib you asked for.
    const spray = pluginById("airspray")!.behaviour.start({ x: 0, y: 0 }, ctx)!;
    const pen = pluginById("pencil")!.behaviour.start({ x: 0, y: 0 }, ctx)!;
    // `paintSpray`'s own cone is 1.6 × the stroke's size; that against the
    // pen's half-width is the comparison that matters.
    const cone = spray.size * 1.6;
    expect(cone / (pen.size / 2)).toBeGreaterThan(0.8);
    expect(cone / (pen.size / 2)).toBeLessThan(1.6);
  });
});

describe("the eraser's strength", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("is offered as the one thing a rubber has to set", () => {
    const eraser = pluginById("eraser")!;
    expect(eraser.dials?.map((d) => d.id)).toEqual(["opacity"]);
    // Not called "opacity" anywhere a user can see it — a rubber has a
    // strength.
    expect(eraser.dials![0]!.nameKey).toBe("dials.strength.name");
  });

  it("lands on the mark's own alpha, which is what destination-out reads", () => {
    // No new plumbing: an erasing mark is composited with `destination-out`,
    // where the ink's alpha *is* how much of what is underneath goes away.
    const half = pluginById("eraser")!.behaviour.start(
      { x: 0, y: 0 },
      { ...ctx, dials: { opacity: 0.5 } },
    )!;
    expect(half.opacity).toBe(0.5);
    // …and at full strength it records nothing at all, so a page rubbed out
    // the ordinary way is the document it always was.
    expect(
      pluginById("eraser")!.behaviour.start({ x: 0, y: 0 }, ctx)!.opacity,
    ).toBeUndefined();
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
    // …and its own *unit*: type is set in points everywhere outside this app,
    // so the tool's gauge is the only one in the box that isn't millimetres.
    expect(text.gauge?.unit).toBe("pt");
    expect(gaugeSizes(text.gauge!).map((px) => Math.round(toPt(px)))).toEqual([
      10, 12, 18, 24, 48,
    ]);
    expect(Math.round(toPt(text.defaultSize!))).toBe(12);
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

  it("is not a tool, and no tool carries it", () => {
    // Throwing a drawing away is an action on the *document*: it begins no
    // gesture and leaves no stroke, so it lives in the right-hand panel and not
    // on a tool's button. Nothing here may register it as a tool either, or it
    // could end up in the toolbar, in Settings → Tools, or on a stroke's
    // `tool` field.
    expect(toolPlugins().map((p) => p.id)).not.toContain("clear");
    expect(allPlugins().map((p) => p.id)).not.toContain("clear");
  });

  it("puts both ways of rubbing out behind the one button", () => {
    // The family the user asked for: a rubber is a *variant of the eraser*, not
    // a second permanent button, so it ships with it and is one press away.
    expect(groupMembers(ERASER_GROUP_ID).map((p) => p.id)).toEqual([
      "eraser",
      "rubber",
    ]);
    for (const member of groupMembers(ERASER_GROUP_ID)) {
      expect(member.group).toBe(ERASER_GROUP_ID);
      // Grouping is about how they are offered and nothing else: each keeps its
      // own painter, its own width and its own persisted id.
      expect(member.erases).toBe(true);
    }
    // The family's id is the eraser's own, which is what carries a settings
    // blob written before the rubber existed into the group rather than
    // switching its button off.
    expect(ERASER_GROUP_ID).toBe("eraser");
    // …and it is offered with nothing switched on, exactly as the eraser was.
    const entries = toolbarEntries(defaultEnabledPlugins(), []);
    expect(entries.filter((e) => e.id === ERASER_GROUP_ID)).toHaveLength(1);
    expect(entries.map((e) => e.id)).not.toContain("rubber");
  });

  it("leaves the eraser an ordinary drawing tool", () => {
    const eraser = pluginById("eraser")!;
    expect(eraser.behaviour.start({ x: 0, y: 0 }, ctx)).not.toBeNull();
    expect(eraser.erases).toBe(true);
    // Its `core` moved onto the family it now shares a button with — which is
    // where a grouped tool's switch lives — and it is still always offered.
    expect(eraser.core).toBeUndefined();
    expect(groupById(ERASER_GROUP_ID)?.core).toBe(true);
    expect(enabledPlugins([]).map((p) => p.id)).toContain("eraser");
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

describe("the shape family's geometry", () => {
  // The polygons are `box` strokes painted by a plugin, so the geometry is
  // the painter's — and a canvas can't be asked whether a pentagon has five
  // evenly spaced corners. The corner maths is pure and answers here.

  it("inscribes a polygon in the drag box, stretched to fill it", () => {
    const corners = polygonCorners({ x: 0, y: 0 }, { x: 100, y: 40 }, 4);
    expect(corners).toHaveLength(4);
    // A vertex leads: straight up from the middle of the box.
    expect(corners[0]!.x).toBeCloseTo(50);
    expect(corners[0]!.y).toBeCloseTo(0);
    // …and the box is filled corner to corner, however it was dragged.
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0);
    expect(Math.max(...xs)).toBeCloseTo(100);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(40);
  });

  it("spaces a polygon's corners evenly", () => {
    const corners = polygonCorners({ x: 0, y: 0 }, { x: 100, y: 100 }, 5);
    const angles = corners.map((p) => Math.atan2(p.y - 50, p.x - 50));
    for (let i = 1; i < angles.length; i++) {
      const step = (angles[i]! - angles[i - 1]! + Math.PI * 2) % (Math.PI * 2);
      expect(step).toBeCloseTo((Math.PI * 2) / 5);
    }
  });

  it("turns the hexagon onto its flats", () => {
    // Straight up from the middle is where the *rectangle* tool's polygon puts
    // a vertex; a hexagon everyone recognises stands on an edge instead.
    const upright = polygonCorners({ x: 0, y: 0 }, { x: 100, y: 100 }, 6);
    const laid = polygonCorners({ x: 0, y: 0 }, { x: 100, y: 100 }, 6, 1 / 12);
    expect(upright[0]!.y).toBeCloseTo(0);
    expect(laid[0]!.y).toBeGreaterThan(0);
  });

  it("alternates a star between its two radii", () => {
    const corners = starCorners({ x: 0, y: 0 }, { x: 100, y: 100 });
    expect(corners).toHaveLength(10);
    const reach = (p: { x: number; y: number }) =>
      Math.hypot(p.x - 50, p.y - 50);
    for (let i = 0; i < corners.length; i += 2) {
      expect(reach(corners[i]!)).toBeGreaterThan(reach(corners[i + 1]!));
    }
  });

  it("drags every shape from the same two anchors", () => {
    // Eleven painters, one gesture: whatever the shape, the stroke records the
    // box the drag described and the painter decides what fills it. That is
    // what keeps the document free of a shape field.
    for (const behaviour of [hexagonBehaviour, starBehaviour]) {
      let draft = behaviour.start({ x: 10, y: 10 }, ctx)!;
      draft = behaviour.move(draft, { x: 60, y: 90 }, ctx);
      expect(draft.shape).toEqual({
        kind: "box",
        from: { x: 10, y: 10 },
        to: { x: 60, y: 90 },
      });
    }
  });
});

describe("select behaviour", () => {
  beforeEach(() => {
    resetPlugins();
    registerBuiltinPlugins();
  });

  it("marks the whole selection family as choosing rather than making", () => {
    const selecting = allPlugins().filter((p) => p.selects);
    expect(selecting.map((p) => p.id)).toEqual([
      "select",
      "select-oval",
      "select-lasso",
      "select-trace",
    ]);
    // …and they are exactly the family behind the one button, so no selection
    // tool can ever be offered without the switch that turns them all on.
    expect(groupMembers(SELECT_GROUP_ID).map((p) => p.id)).toEqual(
      selecting.map((p) => p.id),
    );
  });

  it("drags an ordinary two-corner box, so the whole gesture pipeline is reused", () => {
    let draft = selectBehaviour.start({ x: 4, y: 4 }, ctx)!;
    draft = selectBehaviour.move(draft, { x: 40, y: 30 }, ctx);
    expect(draft.shape).toEqual({
      kind: "box",
      from: { x: 4, y: 4 },
      to: { x: 40, y: 30 },
    });
  });

  it("records no colour, so a marquee never resolves ink against the page", () => {
    const draft = selectBehaviour.start({ x: 0, y: 0 }, ctx)!;
    expect(draft.color).toBeUndefined();
  });

  it("keeps a press that never moved — a tap means 'select nothing'", () => {
    // Every other two-corner tool drops one, because a zero-size shape is a
    // mis-tap. Here it is an instruction, and dropping it would leave the last
    // selection hanging around after an obvious attempt to clear it.
    const draft = selectBehaviour.start({ x: 5, y: 5 }, ctx)!;
    expect(selectBehaviour.end!(draft, ctx)).toBe(draft);
  });

  it("hands the box over as the four corners it covers", () => {
    // Whatever the gesture, what reaches the screen is closed contours in
    // document coordinates — that is the one currency, and it is why a lasso
    // and a traced area need nothing new of the screen (see `selection.ts`).
    let draft = selectBehaviour.start({ x: 40, y: 30 }, ctx)!;
    draft = selectBehaviour.move(draft, { x: 4, y: 4 }, ctx);
    expect(selectBehaviour.selection!(draft)).toEqual([
      [
        { x: 4, y: 4 },
        { x: 40, y: 4 },
        { x: 40, y: 30 },
        { x: 4, y: 30 },
      ],
    ]);
  });

  it("chooses nothing from a gesture that never went anywhere", () => {
    for (const behaviour of [selectBehaviour, selectOvalBehaviour]) {
      const tap = behaviour.start({ x: 5, y: 5 }, ctx)!;
      expect(behaviour.selection!(tap)).toBeNull();
      // A drag under the same two pixels a shape tool throws away is a tap too.
      const nudged = behaviour.move(tap, { x: 6, y: 5 }, ctx);
      expect(behaviour.selection!(nudged)).toBeNull();
    }
    const pressed = selectLassoBehaviour.start({ x: 5, y: 5 }, ctx)!;
    expect(selectLassoBehaviour.selection!(pressed)).toBeNull();
  });

  it("reads the oval marquee's drag as the ellipse inside it", () => {
    let draft = selectOvalBehaviour.start({ x: 0, y: 0 }, ctx)!;
    draft = selectOvalBehaviour.move(draft, { x: 100, y: 50 }, ctx);
    // The same two corners a box marquee records — the difference is only what
    // they are read as.
    expect(draft.shape).toEqual({
      kind: "box",
      from: { x: 0, y: 0 },
      to: { x: 100, y: 50 },
    });
    const loop = selectOvalBehaviour.selection!(draft)![0]!;
    expect(loop.length).toBeGreaterThan(16);
    for (const p of loop) {
      // Inside the drag, and on the ellipse it inscribes.
      expect(p.x).toBeGreaterThanOrEqual(-0.001);
      expect(p.x).toBeLessThanOrEqual(100.001);
      expect(p.y).toBeGreaterThanOrEqual(-0.001);
      expect(p.y).toBeLessThanOrEqual(50.001);
      const dx = (p.x - 50) / 50;
      const dy = (p.y - 25) / 25;
      expect(Math.hypot(dx, dy)).toBeCloseTo(1);
    }
  });

  it("closes a lasso's loop for it, and thins the samples on the way", () => {
    let draft = selectLassoBehaviour.start({ x: 0, y: 0 }, ctx)!;
    for (const p of [
      { x: 0, y: 0.2 }, // under the step: the same point again, dropped
      { x: 30, y: 0 },
      { x: 30, y: 20 },
      { x: 0, y: 20 },
    ]) {
      draft = selectLassoBehaviour.move(draft, p, ctx);
    }
    expect(draft.shape).toEqual({
      kind: "path",
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 0 },
        { x: 30, y: 20 },
        { x: 0, y: 20 },
      ],
    });
    // The loop the hand drew, closed — the screen joins the last point back to
    // the first, so the gesture never has to end where it began.
    expect(selectLassoBehaviour.selection!(draft)).toEqual([
      (draft.shape as { points: Point[] }).points,
    ]);
  });

  it("traces the area under the press rather than a shape drawn over it", () => {
    // The bucket's machinery, borrowed: the same probe, the same contours —
    // the only difference is that the outline goes to the screen instead of
    // into the document.
    const blob = [
      [
        { x: 2, y: 2 },
        { x: 9, y: 3 },
        { x: 7, y: 11 },
      ],
    ];
    const probed: ToolContext = {
      ...ctx,
      probe: { colorAt: () => "#123456", regionAt: () => blob },
    };
    const draft = selectTraceBehaviour.start({ x: 5, y: 5 }, probed)!;
    expect(draft.shape).toEqual({ kind: "region", contours: blob });
    expect(selectTraceBehaviour.selection!(draft)).toEqual(blob);
  });

  it("chooses nothing from a press on the bare sheet", () => {
    // The page colour floods to the shape of everything *around* the marks, and
    // every mark borders it — so tracing it would hand back the whole drawing
    // for the press that meant the least. A press on nothing means nothing.
    const sheet: ToolContext = {
      ...ctx,
      probe: {
        colorAt: () => ctx.background.toUpperCase(),
        regionAt: () => [
          [
            { x: 0, y: 0 },
            { x: 400, y: 0 },
            { x: 400, y: 300 },
            { x: 0, y: 300 },
          ],
        ],
      },
    };
    const draft = selectTraceBehaviour.start({ x: 5, y: 5 }, sheet)!;
    expect(draft.shape).toEqual({ kind: "region", contours: [] });
    expect(selectTraceBehaviour.selection!(draft)).toBeNull();
  });

  it("still begins a gesture where there is nothing to trace, so a press can clear the selection", () => {
    // No probe at all — a headless caller, or a browser that refused the
    // pixels. The bucket refuses the press outright; this one must not, or
    // pressing an empty page would leave the last selection standing.
    const draft = selectTraceBehaviour.start({ x: 5, y: 5 }, ctx)!;
    expect(draft.shape).toEqual({ kind: "region", contours: [] });
    expect(selectTraceBehaviour.selection!(draft)).toBeNull();
  });
});
