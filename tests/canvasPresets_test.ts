// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { allSizePresets, sizePresets } from "../src/app/canvasSize.ts";
import {
  MAX_CANVAS_PRESETS,
  canAddCanvasPreset,
  canvasShelf,
  canvasPresetById,
  canvasPresetId,
  canvasPresetName,
  cleanCanvasPresets,
  cleanHiddenSizes,
  kitCustomizes,
  kitGroupTool,
  moveInOrder,
  removeCanvasPreset,
  saveCanvasPreset,
  SOLID_STOCK,
  toolbarFor,
  withGroupTool,
  withHidden,
  withKitTool,
  withTool,
  type CanvasPreset,
} from "../src/app/canvasPresets.ts";

// A canvas preset is a page you set up once — a size, a name, and optionally the
// kit of tools that page is worked with. Everything the Canvas settings tab and
// the New image shelf lean on lives in the module under test, so the whole
// create-hide-reorder cycle is driven here without a browser: what a saved one
// looks like, what survives a round trip through the settings blob, what the
// shelf ends up offering, and which toolbar a drawing made on one gets.

const SKETCHBOOK: CanvasPreset = {
  id: "sketchbook",
  name: "Sketchbook",
  size: { width: 1600, height: 2000 },
  kit: { tools: ["graphite"], order: ["graphite", "eraser"] },
};

describe("canvasPresetName", () => {
  it("trims and collapses whitespace", () => {
    expect(canvasPresetName("  my  sketchbook ")).toBe("my sketchbook");
  });

  it("has nothing to say about an empty box", () => {
    expect(canvasPresetName("   ")).toBeNull();
    expect(canvasPresetName("")).toBeNull();
  });

  it("caps the length", () => {
    expect(canvasPresetName("x".repeat(80))).toHaveLength(32);
  });
});

describe("canvasPresetId", () => {
  it("slugs the name, so a blob is readable", () => {
    expect(canvasPresetId("My Sketchbook!", [])).toBe("my-sketchbook");
  });

  it("counts up rather than refusing a name twice", () => {
    expect(canvasPresetId("Sketchbook", ["sketchbook"])).toBe("sketchbook-2");
  });

  it("falls back to a name for one that slugs to nothing", () => {
    expect(canvasPresetId("###", [])).toBe("canvas");
  });
});

describe("saveCanvasPreset", () => {
  it("adds a new one at the end of the shelf", () => {
    const list = saveCanvasPreset([], {
      name: "Sketchbook",
      size: { width: 1600, height: 2000 },
    });
    expect(list).toEqual([
      {
        id: "sketchbook",
        name: "Sketchbook",
        size: { width: 1600, height: 2000 },
      },
    ]);
  });

  it("edits in place, keeping the id pages point at", () => {
    const list = saveCanvasPreset([SKETCHBOOK], {
      id: "sketchbook",
      name: "Sketchbook, big",
      size: { width: 2000, height: 2400 },
      kit: SKETCHBOOK.kit,
    });
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe("sketchbook");
    expect(list[0]!.name).toBe("Sketchbook, big");
    expect(list[0]!.size).toEqual({ width: 2000, height: 2400 });
  });

  it("drops the kit when the editor switched it off", () => {
    const list = saveCanvasPreset([SKETCHBOOK], {
      id: "sketchbook",
      name: "Sketchbook",
      size: SKETCHBOOK.size,
    });
    expect(list[0]).not.toHaveProperty("kit");
  });

  it("clamps a size to what a page can be", () => {
    const list = saveCanvasPreset([], {
      name: "Huge",
      size: { width: 99999, height: 1 },
    });
    expect(list[0]!.size).toEqual({ width: 8192, height: 64 });
  });

  it("refuses a nameless one", () => {
    expect(
      saveCanvasPreset([], { name: "  ", size: { width: 100, height: 100 } }),
    ).toEqual([]);
  });

  it("refuses to add past the cap, and says so first", () => {
    let list: CanvasPreset[] = [];
    for (let n = 0; n < MAX_CANVAS_PRESETS; n++) {
      list = saveCanvasPreset(list, {
        name: `Page ${n}`,
        size: { width: 100, height: 100 },
      });
    }
    expect(list).toHaveLength(MAX_CANVAS_PRESETS);
    expect(canAddCanvasPreset(list)).toBe(false);
    expect(
      saveCanvasPreset(list, {
        name: "One more",
        size: { width: 100, height: 100 },
      }),
    ).toHaveLength(MAX_CANVAS_PRESETS);
  });

  it("still edits an existing one when the shelf is full", () => {
    let list: CanvasPreset[] = [];
    for (let n = 0; n < MAX_CANVAS_PRESETS; n++) {
      list = saveCanvasPreset(list, {
        name: `Page ${n}`,
        size: { width: 100, height: 100 },
      });
    }
    const edited = saveCanvasPreset(list, {
      id: list[0]!.id,
      name: "Renamed",
      size: { width: 200, height: 200 },
    });
    expect(edited).toHaveLength(MAX_CANVAS_PRESETS);
    expect(edited[0]!.name).toBe("Renamed");
  });
});

describe("removeCanvasPreset", () => {
  it("takes one off the shelf and leaves the rest", () => {
    expect(removeCanvasPreset([SKETCHBOOK], "sketchbook")).toEqual([]);
    expect(removeCanvasPreset([SKETCHBOOK], "other")).toEqual([SKETCHBOOK]);
  });
});

describe("withTool", () => {
  it("switches one on once, however many times it is asked", () => {
    const kit = { tools: [], order: [] };
    const on = withTool(kit, "marker", true);
    expect(on.tools).toEqual(["marker"]);
    expect(withTool(on, "marker", true).tools).toEqual(["marker"]);
  });

  it("switches one off", () => {
    expect(
      withTool({ tools: ["marker"], order: [] }, "marker", false).tools,
    ).toEqual([]);
  });
});

// The other half of a kit: not *which* tools a page is worked with, but which
// one of a family its button opens on and how each of them is set. Both maps are
// sparse and both are meant to leave no trace when they are unset, so a preset
// that has been set up and unset again is the preset it was.
describe("withGroupTool", () => {
  it("pins which member of a family the page opens on", () => {
    const kit = withGroupTool({ tools: [], order: [] }, "erasers", "rubber");
    expect(kit.groupTools).toEqual({ erasers: "rubber" });
    expect(kitGroupTool(kit, "erasers")).toBe("rubber");
  });

  it("gives the answer back to the app, leaving no trace", () => {
    const kit = withGroupTool({ tools: [], order: [] }, "erasers", "rubber");
    expect(withGroupTool(kit, "erasers", null)).toEqual({
      tools: [],
      order: [],
    });
    expect(kitGroupTool(withGroupTool(kit, "erasers", null), "erasers")).toBe(
      undefined,
    );
  });
});

describe("withKitTool", () => {
  const kneaded = { size: 120, dials: { pressure: 0.4 } };

  it("sets one tool up, and copies what it was handed", () => {
    const dials = { pressure: 0.4 };
    const kit = withKitTool({ tools: [], order: [] }, "rubber", {
      size: 120,
      dials,
    });
    dials.pressure = 1;
    expect(kit.toolSettings).toEqual({ rubber: kneaded });
  });

  it("forgets one, leaving no trace", () => {
    const kit = withKitTool({ tools: [], order: [] }, "rubber", kneaded);
    expect(withKitTool(kit, "rubber", null)).toEqual({ tools: [], order: [] });
  });

  it("leaves the tools it says nothing about alone", () => {
    const kit = withKitTool(
      withKitTool({ tools: [], order: [] }, "rubber", kneaded),
      "graphite",
      { size: 4, dials: {} },
    );
    expect(Object.keys(kit.toolSettings!)).toEqual(["rubber", "graphite"]);
  });
});

describe("kitCustomizes", () => {
  const kit = withKitTool(
    withGroupTool({ tools: [], order: [] }, "erasers", "rubber"),
    "graphite",
    { size: 4, dials: {} },
  );

  it("sees a family whose default this page has picked", () => {
    expect(kitCustomizes(kit, "erasers", ["eraser", "rubber"])).toBe(true);
  });

  it("sees a tool this page has set up, whichever of a family it is", () => {
    expect(kitCustomizes(kit, "graphite", ["graphite"])).toBe(true);
  });

  it("says nothing about a tool the page says nothing about", () => {
    expect(kitCustomizes(kit, "shapes", ["rectangle", "ellipse"])).toBe(false);
  });
});

describe("moveInOrder", () => {
  it("walks an id up and down the list", () => {
    expect(moveInOrder(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveInOrder(["a", "b", "c"], 0, 1)).toEqual(["b", "a", "c"]);
  });

  it("leaves the order alone for a move off the ends", () => {
    expect(moveInOrder(["a", "b"], 0, 5)).toEqual(["a", "b"]);
    expect(moveInOrder(["a", "b"], -1, 0)).toEqual(["a", "b"]);
    expect(moveInOrder(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("withHidden", () => {
  it("holds the ids that are off, each of them once", () => {
    expect(withHidden([], "hd", true)).toEqual(["hd"]);
    expect(withHidden(["hd"], "hd", true)).toEqual(["hd"]);
    expect(withHidden(["hd", "uhd"], "hd", false)).toEqual(["uhd"]);
  });
});

describe("canvasShelf", () => {
  const screen = { width: 1000, height: 2000 };

  it("offers the shipped sizes, then the pages you set up", () => {
    const shelf = canvasShelf(
      sizePresets(screen, "portrait"),
      [],
      [SKETCHBOOK],
      "portrait",
    );
    expect(shelf.map((item) => item.id)).toEqual([
      "screen",
      "hd",
      "uhd",
      "print",
      "sketchbook",
    ]);
    expect(shelf.at(-1)).toMatchObject({
      kind: "preset",
      name: "Sketchbook",
      kit: true,
    });
  });

  it("leaves a hidden size off it", () => {
    const shelf = canvasShelf(
      sizePresets(screen, "portrait"),
      ["hd", "uhd"],
      [],
      "portrait",
    );
    expect(shelf.map((item) => item.id)).toEqual(["screen", "print"]);
  });

  it("leaves a canvas preset standing the way it was set up", () => {
    // The shipped sizes turn to face the shelf; a preset's shape is the one its
    // owner typed, and turning it would hand back a page they never set up.
    const [item] = canvasShelf([], [], [SKETCHBOOK], "landscape");
    expect(item!.size).toEqual(SKETCHBOOK.size);
  });

  it("turns the shipped sizes to face it", () => {
    const [item] = canvasShelf(
      [{ id: "print", size: { width: 2480, height: 3508 } }],
      [],
      [],
      "landscape",
    );
    expect(item!.size).toEqual({ width: 3508, height: 2480 });
  });

  it("says when a page carries no kit", () => {
    const plain: CanvasPreset = {
      id: "panel",
      name: "Panel",
      size: { width: 900, height: 900 },
    };
    const [item] = canvasShelf([], [], [plain], "landscape");
    expect(item).toMatchObject({ kind: "preset", kit: false });
  });
});

describe("the sheet a preset suggests", () => {
  const onPaper = {
    name: "Watercolour pad",
    size: { width: 1600, height: 1200 },
    ground: { stock: "rough", texture: 1.4 },
  };

  it("is saved with the preset", () => {
    const [saved] = saveCanvasPreset([], onPaper);
    expect(saved!.ground).toEqual({ stock: "rough", texture: 1.4 });
  });

  it("is dropped when the editor switched it off", () => {
    const [saved] = saveCanvasPreset([], onPaper);
    const [edited] = saveCanvasPreset([saved!], {
      id: saved!.id,
      name: saved!.name,
      size: saved!.size,
    });
    expect(edited).not.toHaveProperty("ground");
  });

  it("rides onto the shelf, for the dialog to preselect", () => {
    const [saved] = saveCanvasPreset([], onPaper);
    const [item] = canvasShelf([], [], [saved!], "landscape");
    expect(item).toMatchObject({ ground: { stock: "rough", texture: 1.4 } });
  });

  it("holds the grain inside the range the slider offers", () => {
    const [saved] = saveCanvasPreset([], {
      ...onPaper,
      ground: { stock: "rough", texture: 99 },
    });
    expect(saved!.ground).toEqual({ stock: "rough", texture: 2 });
  });

  it("writes no grain for a sheet left as it is sold", () => {
    const [saved] = saveCanvasPreset([], {
      ...onPaper,
      ground: { stock: "rough", texture: 1 },
    });
    expect(saved!.ground).toEqual({ stock: "rough" });
  });

  it("keeps the plain sheet as an answer of its own", () => {
    // Absent means "says nothing about the sheet"; the plain page is a stock
    // like any other, and a preset can mean it (see `SOLID_STOCK`).
    const [saved] = saveCanvasPreset([], {
      ...onPaper,
      ground: { stock: SOLID_STOCK },
    });
    expect(saved!.ground).toEqual({ stock: SOLID_STOCK });
  });

  it("drops one written without a stock", () => {
    const [read] = cleanCanvasPresets([
      { id: "x", name: "X", size: { width: 100, height: 100 }, ground: {} },
    ]);
    expect(read).not.toHaveProperty("ground");
  });
});

describe("toolbarFor", () => {
  const settings = {
    canvasPresets: [SKETCHBOOK],
    enabledPlugins: ["marker", "filler"],
    toolOrder: ["marker", "filler"],
  };

  it("hands back the app's own toolbar for a page made off the shelf", () => {
    expect(toolbarFor(settings, undefined)).toEqual({
      tools: settings.enabledPlugins,
      order: settings.toolOrder,
    });
  });

  it("hands back the canvas preset's kit for a page made on one", () => {
    expect(toolbarFor(settings, "sketchbook")).toEqual({
      tools: SKETCHBOOK.kit!.tools,
      order: SKETCHBOOK.kit!.order,
    });
  });

  it("falls back to the app's for a canvas preset that carries none", () => {
    const plain = {
      ...settings,
      canvasPresets: [
        { id: "panel", name: "Panel", size: { width: 900, height: 900 } },
      ],
    };
    expect(toolbarFor(plain, "panel").tools).toBe(settings.enabledPlugins);
  });

  it("falls back to the app's for one that has since been deleted", () => {
    expect(toolbarFor(settings, "gone").tools).toBe(settings.enabledPlugins);
  });
});

describe("canvasPresetById", () => {
  it("finds one, and says nothing for a page that names none", () => {
    expect(canvasPresetById([SKETCHBOOK], "sketchbook")).toBe(SKETCHBOOK);
    expect(canvasPresetById([SKETCHBOOK], undefined)).toBeUndefined();
    expect(canvasPresetById([SKETCHBOOK], "gone")).toBeUndefined();
  });
});

describe("cleanCanvasPresets", () => {
  it("reads a written shelf back whole", () => {
    expect(cleanCanvasPresets([SKETCHBOOK])).toEqual([SKETCHBOOK]);
  });

  it("drops what cannot be a canvas preset", () => {
    expect(
      cleanCanvasPresets([
        null,
        "sketchbook",
        { name: "No size" },
        { name: "  ", size: { width: 100, height: 100 } },
        { name: "Bad size", size: { width: "wide", height: 100 } },
      ]),
    ).toEqual([]);
    expect(cleanCanvasPresets("nonsense")).toEqual([]);
  });

  it("mints an id for one written without a usable one", () => {
    const [first, second] = cleanCanvasPresets([
      { name: "Sketchbook", size: { width: 100, height: 100 } },
      {
        id: "sketchbook",
        name: "Sketchbook",
        size: { width: 100, height: 100 },
      },
    ]);
    expect(first!.id).toBe("sketchbook");
    expect(second!.id).toBe("sketchbook-2");
  });

  it("keeps a kit naming tools this build may not ship", () => {
    const [kept] = cleanCanvasPresets([
      {
        id: "x",
        name: "X",
        size: { width: 100, height: 100 },
        kit: { tools: ["from-the-future", 7], order: ["from-the-future"] },
      },
    ]);
    expect(kept!.kit).toEqual({
      tools: ["from-the-future"],
      order: ["from-the-future"],
    });
  });

  it("reads a kit that sets its tools up back whole", () => {
    const [kept] = cleanCanvasPresets([
      {
        id: "x",
        name: "X",
        size: { width: 100, height: 100 },
        kit: {
          tools: [],
          order: [],
          groupTools: { erasers: "rubber", shapes: 7 },
          toolSettings: {
            rubber: { size: 120, dials: { pressure: 0.4 } },
            graphite: { size: "wide", dials: { lead: 4 } },
            nothing: { dials: { bad: "x" } },
            broken: "settings",
          },
        },
      },
    ]);
    expect(kept!.kit).toEqual({
      tools: [],
      order: [],
      // A member id that isn't one is dropped; so is a tool setup that says
      // nothing at all once the values that aren't values have gone.
      groupTools: { erasers: "rubber" },
      toolSettings: {
        rubber: { size: 120, dials: { pressure: 0.4 } },
        // …but a width that isn't one only costs the width: the dials it was
        // written with are still a way this page has the tool set.
        graphite: { dials: { lead: 4 } },
      },
    });
  });

  it("leaves no empty maps behind for a kit that sets nothing up", () => {
    const [kept] = cleanCanvasPresets([
      {
        id: "x",
        name: "X",
        size: { width: 100, height: 100 },
        kit: { tools: ["marker"], order: ["marker"] },
      },
    ]);
    expect(kept!.kit).toEqual({ tools: ["marker"], order: ["marker"] });
  });

  it("stops at the cap", () => {
    const many = Array.from({ length: MAX_CANVAS_PRESETS + 5 }, (_, n) => ({
      id: `c${n}`,
      name: `Page ${n}`,
      size: { width: 100, height: 100 },
    }));
    expect(cleanCanvasPresets(many)).toHaveLength(MAX_CANVAS_PRESETS);
  });
});

describe("cleanHiddenSizes", () => {
  it("keeps the ids and nothing else", () => {
    expect(cleanHiddenSizes(["hd", 4, null, "uhd"])).toEqual(["hd", "uhd"]);
    expect(cleanHiddenSizes({})).toEqual([]);
  });
});

describe("allSizePresets", () => {
  it("lists every shipped size, even one this screen already is", () => {
    const screen = { width: 1920, height: 1080 };
    // The shelf drops the duplicate; the settings list must not, or the switch
    // for Full HD would vanish on a 1080p monitor.
    expect(sizePresets(screen).map((p) => p.id)).toEqual([
      "screen",
      "uhd",
      "print",
    ]);
    expect(allSizePresets(screen).map((p) => p.id)).toEqual([
      "screen",
      "hd",
      "uhd",
      "print",
    ]);
  });
});
