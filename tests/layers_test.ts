// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Layers are a *view* of one flat stroke list, so every question about them is
// arithmetic over that list: which layer a mark is on, what order the marks
// come out in, and what survives a delete. The two rules worth guarding are the
// ones nothing else in the app re-states — a mark that names no layer belongs
// to the base wherever the base has been dragged to, and a mark naming a layer
// that isn't there is still a mark on the page.
import { describe, expect, it } from "vitest";

import {
  BACKGROUND_LAYER_ID,
  BASE_LAYER_ID,
  activeLayer,
  activeLayerId,
  backgroundHidden,
  canDeleteLayer,
  canMoveLayerTo,
  drawableLayer,
  groupByLayer,
  defaultLayers,
  drawingLayers,
  hasLayers,
  isLocked,
  lockedMarks,
  nextLayerName,
  reorderLayers,
  strokeLayer,
  strokesExcept,
  transparentLayers,
  visibleStrokes,
  layerDisplayName,
  paintedLayers,
} from "../src/app/layers.ts";
import type { Drawing, Layer, Stroke } from "../src/app/types.ts";

let next = 0;

/** A mark, optionally filed onto a layer. */
function stroke(layer?: string): Stroke {
  return {
    id: `s${next++}`,
    tool: "pencil",
    size: 4,
    ...(layer ? { layer } : {}),
    shape: { kind: "path", points: [{ x: 0, y: 0 }] },
  };
}

function drawing(over: Partial<Drawing> = {}): Drawing {
  return {
    id: "d",
    name: "d",
    width: 100,
    height: 100,
    strokes: [],
    ...over,
  };
}

const base: Layer = { id: BASE_LAYER_ID, name: "" };
const sheet: Layer = { id: BACKGROUND_LAYER_ID, name: "", locked: true };
const top: Layer = { id: "top", name: "Layer 2" };

describe("the implicit stack", () => {
  it("reads a drawing with no layers as the locked sheet plus one layer", () => {
    const page = drawing({ strokes: [stroke(), stroke()] });
    expect(hasLayers(page)).toBe(false);
    expect(drawingLayers(page)).toEqual(defaultLayers());
    expect(drawingLayers(page)).toEqual([
      { id: BACKGROUND_LAYER_ID, name: "", locked: true },
      { id: BASE_LAYER_ID, name: "" },
    ]);
    // …and stamps nothing on the marks it draws, so a document nobody has
    // added a layer to is byte-for-byte what this app has always written.
    expect(activeLayerId(page)).toBeUndefined();
    // The marks land above the sheet, not on it: the sheet is locked, so the
    // first pencil line finds the layer over it without anyone choosing one.
    expect(drawableLayer(page)?.id).toBe(BASE_LAYER_ID);
  });

  it("hands back the document's own stroke array, uncopied", () => {
    // The frame cache compares strokes by identity, so a fresh copy per call
    // would cost an allocation on every frame of every gesture.
    const strokes = [stroke(), stroke()];
    expect(visibleStrokes(drawing({ strokes }))).toBe(strokes);
    expect(visibleStrokes(drawing({ strokes, layers: [base] }))).toBe(strokes);
    // …including when a transparent export asks for the sheet to be left out
    // and there is nothing on it to leave out.
    expect(
      visibleStrokes(drawing({ strokes }), { withoutBackground: true }),
    ).toBe(strokes);
  });
});

describe("a page made of nothing", () => {
  it("is the sheet's own eye, not a second flag beside it", () => {
    const stack = transparentLayers();
    expect(stack.map((l) => l.id)).toEqual(defaultLayers().map((l) => l.id));
    expect(backgroundHidden(drawing({ layers: stack }))).toBe(true);
    expect(backgroundHidden(drawing({ layers: defaultLayers() }))).toBe(false);
  });

  it("leaves a drawing that carries no stack on a sheet", () => {
    // Every drawing written before a page could be made of nothing has no
    // `layers` at all, and reads as the default stack — sheet showing. The
    // transparent stack is stamped rather than implicit for exactly that
    // reason.
    expect(backgroundHidden(drawing())).toBe(false);
  });
});

describe("the sheet", () => {
  it("is locked out of the box, and the lock is what keeps marks off it", () => {
    expect(isLocked(sheet)).toBe(true);
    expect(isLocked(base)).toBe(false);
    const page = drawing({ layers: [sheet, base] });
    // Selecting it is not enough to draw on it — the lock outranks the
    // selection, so a stale pointer at a layer since locked can't swallow a
    // stroke.
    expect(
      activeLayer({ ...page, activeLayerId: BACKGROUND_LAYER_ID }).id,
    ).toBe(BASE_LAYER_ID);
  });

  it("reports there is nowhere to draw when every layer is locked", () => {
    const page = drawing({ layers: [sheet, { ...base, locked: true }] });
    expect(drawableLayer(page)).toBeNull();
  });

  it("takes the page colour with it when it is hidden", () => {
    expect(backgroundHidden(drawing())).toBe(false);
    expect(backgroundHidden(drawing({ layers: [sheet, base] }))).toBe(false);
    expect(
      backgroundHidden(drawing({ layers: [{ ...sheet, hidden: true }, base] })),
    ).toBe(true);
  });

  it("is left out of a transparent export, marks and all", () => {
    const onSheet = stroke(BACKGROUND_LAYER_ID);
    const above = stroke(BASE_LAYER_ID);
    const page = drawing({ strokes: [onSheet, above], layers: [sheet, base] });
    expect(visibleStrokes(page).map((s) => s.id)).toEqual([
      onSheet.id,
      above.id,
    ]);
    expect(
      visibleStrokes(page, { withoutBackground: true }).map((s) => s.id),
    ).toEqual([above.id]);
  });
});

describe("marks on a locked layer", () => {
  it("are recognised through the same rules paint order uses", () => {
    const legacy = stroke();
    const onSheet = stroke(BACKGROUND_LAYER_ID);
    const above = stroke("top");
    const page = drawing({
      strokes: [legacy, onSheet, above],
      layers: [sheet, base, top],
    });
    const locked = lockedMarks(page);
    expect(locked(onSheet)).toBe(true);
    // A mark naming no layer belongs to the base, which is not locked…
    expect(locked(legacy)).toBe(false);
    expect(locked(above)).toBe(false);
    // …and so does a mark naming a layer that isn't there.
    expect(locked(stroke("deleted-elsewhere"))).toBe(false);
  });

  it("answers no without looking when nothing is locked", () => {
    const page = drawing({ layers: [base, top] });
    expect(lockedMarks(page)(stroke(BACKGROUND_LAYER_ID))).toBe(false);
  });
});

describe("paint order", () => {
  it("paints the stack bottom up, in drawn order within a layer", () => {
    const first = stroke(BASE_LAYER_ID);
    const second = stroke("top");
    const third = stroke(BASE_LAYER_ID);
    const page = drawing({
      strokes: [first, second, third],
      layers: [base, top],
    });
    expect(visibleStrokes(page).map((s) => s.id)).toEqual([
      first.id,
      third.id,
      second.id,
    ]);
  });

  it("leaves a hidden layer's marks out entirely", () => {
    const under = stroke(BASE_LAYER_ID);
    const over = stroke("top");
    const page = drawing({
      strokes: [under, over],
      layers: [base, { ...top, hidden: true }],
    });
    expect(visibleStrokes(page).map((s) => s.id)).toEqual([under.id]);
    // Including when the hidden one is the only layer there is.
    expect(
      visibleStrokes(
        drawing({ strokes: [under], layers: [{ ...base, hidden: true }] }),
      ),
    ).toEqual([]);
  });

  it("carries the marks that name no layer with the base, not with the bottom", () => {
    // The case a minted base id would get wrong: legacy marks name nothing, so
    // raising the base has to lift them over the layer they were under.
    const legacy = stroke();
    const above = stroke("top");
    const page = drawing({
      strokes: [legacy, above],
      layers: [top, base],
    });
    expect(visibleStrokes(page).map((s) => s.id)).toEqual([
      above.id,
      legacy.id,
    ]);
    expect(strokeLayer(legacy, page).id).toBe(BASE_LAYER_ID);
  });

  it("paints a mark whose layer is gone rather than dropping it", () => {
    const orphan = stroke("deleted-elsewhere");
    const page = drawing({ strokes: [orphan], layers: [base, top] });
    expect(visibleStrokes(page)).toEqual([orphan]);
    expect(strokeLayer(orphan, page).id).toBe(BASE_LAYER_ID);
  });
});

describe("what the panel previews", () => {
  it("groups the marks by layer, hidden ones included", () => {
    // The panel paints each row's preview from these, so a hidden layer still
    // has to be grouped — the row shows what is *on* the layer, not what is
    // currently showing.
    const legacy = stroke();
    const above = stroke("top");
    const filed = stroke(BASE_LAYER_ID);
    const page = drawing({
      strokes: [legacy, above, filed],
      layers: [base, { ...top, hidden: true }],
    });
    expect([...groupByLayer(page)]).toEqual([
      [BASE_LAYER_ID, [legacy, filed]],
      ["top", [above]],
    ]);
  });

  it("gives every layer a group, empty ones included", () => {
    expect([...groupByLayer(drawing({ layers: [base, top] }))]).toEqual([
      [BASE_LAYER_ID, []],
      ["top", []],
    ]);
  });

  it("keeps each layer's marks in the order they were drawn", () => {
    const first = stroke("top");
    const other = stroke(BASE_LAYER_ID);
    const second = stroke("top");
    const page = drawing({
      strokes: [first, other, second],
      layers: [base, top],
    });
    expect(groupByLayer(page).get("top")).toEqual([first, second]);
  });
});

describe("what may be deleted", () => {
  it("keeps the last layer, the locked ones, and the last one taking marks", () => {
    const stack = drawing({ layers: [sheet, base, top] });
    expect(canDeleteLayer(stack, "top")).toBe(true);
    expect(canDeleteLayer(stack, BASE_LAYER_ID)).toBe(true);
    // The sheet is locked, so the bin never applies to it.
    expect(canDeleteLayer(stack, BACKGROUND_LAYER_ID)).toBe(false);
    // …and a layer that isn't there is not deletable either.
    expect(canDeleteLayer(stack, "gone")).toBe(false);
  });

  it("refuses the delete that would leave a page you can't draw on", () => {
    // [locked sheet, Layer 1]: losing Layer 1 leaves a stack that takes no
    // marks at all, which is a dead end one press away.
    const fresh = drawing({ layers: defaultLayers() });
    expect(canDeleteLayer(fresh, BASE_LAYER_ID)).toBe(false);
    // With something else still open it goes through.
    expect(
      canDeleteLayer(drawing({ layers: [sheet, base, top] }), BASE_LAYER_ID),
    ).toBe(true);
  });

  it("keeps the only layer there is", () => {
    expect(canDeleteLayer(drawing({ layers: [base] }), BASE_LAYER_ID)).toBe(
      false,
    );
  });
});

describe("deleting a layer", () => {
  it("takes the marks on it, and the homeless ones with the base", () => {
    const legacy = stroke();
    const filed = stroke(BASE_LAYER_ID);
    const above = stroke("top");
    const page = drawing({
      strokes: [legacy, filed, above],
      layers: [base, top],
    });
    expect(strokesExcept(page, "top")).toEqual([legacy, filed]);
    expect(strokesExcept(page, BASE_LAYER_ID)).toEqual([above]);
  });
});

describe("the selected layer", () => {
  it("falls back to the top of the stack", () => {
    const page = drawing({ layers: [base, top] });
    expect(activeLayer(page).id).toBe("top");
    expect(activeLayer({ ...page, activeLayerId: "gone" }).id).toBe("top");
    expect(activeLayer({ ...page, activeLayerId: BASE_LAYER_ID }).id).toBe(
      BASE_LAYER_ID,
    );
    expect(activeLayerId({ ...page, activeLayerId: BASE_LAYER_ID })).toBe(
      BASE_LAYER_ID,
    );
  });
});

describe("reordering", () => {
  const stack = [base, top, { id: "third", name: "Layer 3" }];

  it("moves one layer and keeps the rest in order", () => {
    expect(reorderLayers(stack, 0, 2).map((l) => l.id)).toEqual([
      "top",
      "third",
      BASE_LAYER_ID,
    ]);
    expect(reorderLayers(stack, 2, 1).map((l) => l.id)).toEqual([
      BASE_LAYER_ID,
      "third",
      "top",
    ]);
  });

  it("hands the stack back untouched for a move that goes nowhere", () => {
    for (const [from, to] of [
      [1, 1],
      [-1, 0],
      [0, 3],
      [3, 0],
    ]) {
      expect(reorderLayers(stack, from!, to!)).toEqual(stack);
    }
  });
});

describe("what may be moved", () => {
  // The sheet doesn't move, and nothing goes under it. It is the page — every
  // mark is on top of it by definition, and it carries the page colour — so a
  // background shuffled into the middle of a stack would paint over half the
  // drawing.
  const stacked = drawing({ layers: [sheet, base, top] });

  it("pins the sheet to the bottom of the stack", () => {
    expect(canMoveLayerTo(stacked, BACKGROUND_LAYER_ID, 1)).toBe(false);
    expect(canMoveLayerTo(stacked, BACKGROUND_LAYER_ID, 2)).toBe(false);
  });

  it("lets nothing slide under the sheet", () => {
    expect(canMoveLayerTo(stacked, BASE_LAYER_ID, 0)).toBe(false);
    expect(canMoveLayerTo(stacked, "top", 0)).toBe(false);
    // …but everything above it still moves freely.
    expect(canMoveLayerTo(stacked, BASE_LAYER_ID, 2)).toBe(true);
    expect(canMoveLayerTo(stacked, "top", 1)).toBe(true);
  });

  it("refuses a move that goes nowhere or off the ends", () => {
    expect(canMoveLayerTo(stacked, "top", 2)).toBe(false);
    expect(canMoveLayerTo(stacked, "top", 3)).toBe(false);
    expect(canMoveLayerTo(stacked, "top", -1)).toBe(false);
    expect(canMoveLayerTo(stacked, "gone", 1)).toBe(false);
  });

  it("still moves a layer another build left under the sheet", () => {
    // Only reachable from a document this app didn't write. It may come up out
    // of there; it may just not go further down.
    const upended = drawing({ layers: [base, sheet, top] });
    expect(canMoveLayerTo(upended, BASE_LAYER_ID, 2)).toBe(true);
    expect(canMoveLayerTo(upended, "top", 1)).toBe(false);
  });

  it("answers the same on a drawing with no stack of its own", () => {
    // The implicit stack is the sheet with one layer over it, so the same two
    // rules hold before anyone has touched the panel.
    const implicit = drawing();
    expect(canMoveLayerTo(implicit, BACKGROUND_LAYER_ID, 1)).toBe(false);
    expect(canMoveLayerTo(implicit, BASE_LAYER_ID, 0)).toBe(false);
  });
});

describe("naming a new layer", () => {
  const name = (n: number) => `Layer ${n}`;

  it("numbers past the end of the stack", () => {
    expect(nextLayerName([base], name)).toBe("Layer 2");
    expect(nextLayerName([base, top], name)).toBe("Layer 3");
  });

  it("doesn't count the sheet — it is not Layer n", () => {
    // A fresh drawing is [sheet, Layer 1]; the layer offered next is Layer 2,
    // not Layer 3.
    expect(nextLayerName(defaultLayers(), name)).toBe("Layer 2");
    expect(nextLayerName([sheet, base, top], name)).toBe("Layer 3");
  });

  it("skips a number still in use after a delete", () => {
    // Two layers, but "Layer 3" is one of them: numbering by count alone would
    // hand out a name the panel is already showing.
    expect(nextLayerName([base, { id: "x", name: "Layer 3" }], name)).toBe(
      "Layer 4",
    );
  });
});

// The stack as a *repaint* walks it. Splitting the paint order into layers is
// what lets one be composited on its own — a layer whose wet marks have to mix
// among themselves, or one an effect is being previewed on (see `render.ts`) —
// and the danger of having two ways to ask "what gets painted" is that they
// drift into two different pictures, so the first thing pinned here is that
// they cannot.

describe("paintedLayers", () => {
  it("comes to exactly visibleStrokes when its layers are concatenated", () => {
    const layers: Layer[] = [
      { id: BACKGROUND_LAYER_ID, name: "" },
      { id: BASE_LAYER_ID, name: "" },
      { id: "top", name: "Top" },
    ];
    const d: Drawing = {
      id: "d",
      name: "d",
      width: 100,
      height: 100,
      layers,
      strokes: [
        stroke("top"),
        stroke(BACKGROUND_LAYER_ID),
        stroke(),
        stroke("top"),
        stroke(BASE_LAYER_ID),
      ],
    };
    for (const scope of [{}, { withoutBackground: true }]) {
      expect(paintedLayers(d, scope).flatMap((entry) => entry.strokes)).toEqual(
        visibleStrokes(d, scope),
      );
    }
  });

  it("leaves a hidden layer out and keeps an empty one in", () => {
    const layers: Layer[] = [
      { id: BASE_LAYER_ID, name: "" },
      { id: "gone", name: "Hidden", hidden: true },
      { id: "empty", name: "Empty" },
    ];
    const d: Drawing = {
      id: "d",
      name: "d",
      width: 100,
      height: 100,
      layers,
      strokes: [stroke(), stroke("gone")],
    };
    // An empty layer still gets its turn: a layer with nothing on it is the
    // caller's no-op to spot, and a walk that skipped it would make "which
    // layer is this" depend on what happened to be drawn.
    expect(paintedLayers(d).map((entry) => entry.layer.id)).toEqual([
      BASE_LAYER_ID,
      "empty",
    ]);
  });
});

describe("layerDisplayName", () => {
  const names = { background: "Background", base: "Layer" };

  it("uses the layer's own name whenever it has one", () => {
    expect(layerDisplayName({ id: "x", name: "Photo" }, names)).toBe("Photo");
    expect(layerDisplayName({ id: "x", name: "  Photo  " }, names)).toBe(
      "Photo",
    );
  });

  it("names the two layers every drawing starts with nameless", () => {
    // The rule lives in one place so the panel and the effect dialog can never
    // call the same sheet two different things.
    expect(layerDisplayName({ id: BACKGROUND_LAYER_ID, name: "" }, names)).toBe(
      "Background",
    );
    expect(layerDisplayName({ id: BASE_LAYER_ID, name: "" }, names)).toBe(
      "Layer",
    );
  });
});
