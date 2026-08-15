// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Saved tools — "my sketching pencil".
//
// A preset is a whole tool under a name, and the two things worth pinning down
// are that it *is* whole (a width and every dial, so applying one can put a
// dial back as well as away) and that it survives the round trip through the
// settings blob it is persisted in.

import { describe, expect, it } from "vitest";

import { registerBuiltinPlugins } from "../src/app/plugins/builtin/index.ts";
import {
  MAX_PRESETS,
  activePreset,
  addPreset,
  cleanPresets,
  nextPresetName,
  presetId,
  presetMatches,
  presetName,
  removePreset,
  type ToolPreset,
} from "../src/app/presets.ts";
import { mm } from "../src/app/units.ts";
import {
  defaultSettings,
  parseSettings,
  presetsFor,
} from "../src/app/useAppSettings.ts";

registerBuiltinPlugins();

const SKETCH = { size: mm(0.7), dials: { grade: 1.5, opacity: 0.8 } };

describe("saving a tool", () => {
  it("keeps the width and every dial, under the name it was given", () => {
    const [saved, ...rest] = addPreset(
      [],
      "My sketching pencil",
      SKETCH.size,
      SKETCH.dials,
    );
    expect(rest).toEqual([]);
    expect(saved!.name).toBe("My sketching pencil");
    expect(saved!.size).toBe(SKETCH.size);
    expect(saved!.dials).toEqual(SKETCH.dials);
    // The stored dials are a copy: tuning the tool afterwards must not rewrite
    // what was saved.
    expect(saved!.dials).not.toBe(SKETCH.dials);
  });

  it("mints an id from the name, and counts up rather than colliding", () => {
    expect(presetId("My sketching pencil", [])).toBe("my-sketching-pencil");
    expect(presetId("My sketching pencil", ["my-sketching-pencil"])).toBe(
      "my-sketching-pencil-2",
    );
    // A name with nothing usable in it still has to address something.
    expect(presetId("♥♥♥", [])).toBe("preset");
  });

  it("saves over a name the tool already has", () => {
    const once = addPreset([], "Liner", 4, { hair: 0.6 });
    const again = addPreset(once, "Liner", 9, { hair: 1.4 });
    // Replaced in place, keeping its id and its position in the row — saving
    // over something is not adding a second something.
    expect(again).toHaveLength(1);
    expect(again[0]!.id).toBe(once[0]!.id);
    expect(again[0]!.size).toBe(9);
  });

  it("reads the row in the order it was built, and drops the oldest past the cap", () => {
    let list: ToolPreset[] = [];
    for (let n = 1; n <= MAX_PRESETS + 2; n++) {
      list = addPreset(list, `Tool ${n}`, n, {});
    }
    expect(list).toHaveLength(MAX_PRESETS);
    // The two oldest went; a shelf is not a most-recently-used stack, so what
    // is left is still in the order it was made.
    expect(list[0]!.name).toBe("Tool 3");
    expect(list.at(-1)!.name).toBe(`Tool ${MAX_PRESETS + 2}`);
  });

  it("offers a name nobody has used for this tool yet", () => {
    const list = addPreset([], "Preset 1", 4, {});
    expect(nextPresetName(list, "Preset")).toBe("Preset 2");
  });

  it("refuses a name that is only whitespace", () => {
    expect(presetName("   ")).toBeNull();
    expect(presetName("  my  pencil  ")).toBe("my pencil");
  });

  it("keeps the mark it was saved with, and drops one it cannot draw", () => {
    // A row of saved tools is read at a glance and mostly with a thumb, and
    // four chips of similar words are four chips you have to *read*.
    const [saved] = addPreset([], "Sketch", 8, {}, "star");
    expect(saved!.glyph).toBe("star");
    // …but only a glyph this build's catalogue actually holds: the chip draws
    // it, and a name it cannot draw is an empty square.
    const cleaned = cleanPresets({
      graphite: [
        { name: "Real", size: 8, dials: {}, glyph: "leaf" },
        { name: "Invented", size: 8, dials: {}, glyph: "not-a-glyph" },
      ],
    });
    expect(cleaned.graphite!.map((p) => p.glyph ?? null)).toEqual([
      "leaf",
      null,
    ]);
    // A preset saved without one carries no field at all, so a blob written
    // before marks existed is byte-for-byte what it was.
    expect("glyph" in addPreset([], "Plain", 8, {})[0]!).toBe(false);
  });

  it("forgets one by id", () => {
    const list = addPreset(addPreset([], "A", 1, {}), "B", 2, {});
    expect(removePreset(list, list[0]!.id).map((p) => p.name)).toEqual(["B"]);
  });
});

describe("which preset the tool is on", () => {
  const list = addPreset([], "Sketch", SKETCH.size, SKETCH.dials);

  it("is an observation, not a mode", () => {
    expect(activePreset(list, SKETCH.size, SKETCH.dials)?.name).toBe("Sketch");
    // Move a dial and the light goes out. Nothing was entered, so nothing is
    // left — that is the whole of what "not a mode" means here.
    expect(
      activePreset(list, SKETCH.size, { ...SKETCH.dials, grade: 1 }),
    ).toBeUndefined();
    expect(activePreset(list, SKETCH.size + 3, SKETCH.dials)).toBeUndefined();
  });

  it("survives a width rounded on its way through the settings blob", () => {
    // Half a document pixel is a sixteenth of a millimetre — finer than any
    // press resolves, and a preset that stopped matching itself after a reload
    // would be a bug nobody could see the cause of.
    expect(presetMatches(list[0]!, SKETCH.size + 0.3, SKETCH.dials)).toBe(true);
    expect(presetMatches(list[0]!, SKETCH.size + 2, SKETCH.dials)).toBe(false);
  });

  it("ignores a dial the tool no longer offers", () => {
    // A dial that was dropped between builds is not a difference: there is
    // nothing the tool could be set to.
    expect(presetMatches(list[0]!, SKETCH.size, { grade: 1.5 })).toBe(true);
  });
});

describe("presets in the settings blob", () => {
  it("comes back the way it went in", () => {
    const blob = {
      toolPresets: {
        graphite: [
          { id: "sketch", name: "Sketch", size: 8, dials: { grade: 1.5 } },
        ],
      },
    };
    const parsed = parseSettings(JSON.stringify(blob));
    expect(presetsFor(parsed, "graphite")).toEqual(blob.toolPresets.graphite);
    expect(presetsFor(parsed, "pencil")).toEqual([]);
  });

  it("drops a half-written one rather than rendering a broken chip", () => {
    // Stricter than the tunings map beside it, which keeps values it does not
    // recognise in case a downgrade wants them: a preset is a button, and a
    // button that breaks the panel is worse than a number nothing reads.
    const parsed = cleanPresets({
      graphite: [
        { name: "", size: 4, dials: {} },
        { name: "No size" },
        { name: "Fine", size: -2 },
        { name: "Good", size: 4, dials: { grade: "soft", opacity: 0.5 } },
        "nonsense",
      ],
      broken: "not a list",
    });
    expect(Object.keys(parsed)).toEqual(["graphite"]);
    expect(parsed.graphite).toEqual([
      { id: "good", name: "Good", size: 4, dials: { opacity: 0.5 } },
    ]);
  });

  it("is empty on a fresh install", () => {
    expect(defaultSettings().toolPresets).toEqual({});
  });
});
