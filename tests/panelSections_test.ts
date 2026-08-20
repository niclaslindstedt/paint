// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { EFFECTS } from "../src/app/effects.ts";
import {
  effectItemId,
  isItemOn,
  isSectionOn,
  itemsOn,
  orderedSections,
  PANEL_SECTIONS,
  sectionHasContent,
  visibleSections,
} from "../src/app/panelSections.ts";

// What the right-hand panel is made of, and what the user is allowed to do to
// it: reorder the sections, switch one off whole, or thin one out a function at
// a time. The module is pure, so the whole arrangement is driven here without a
// panel on screen.

const ids = (sections: readonly { id: string }[]) => sections.map((s) => s.id);

describe("PANEL_SECTIONS", () => {
  it("ships colour under the stack", () => {
    expect(ids(PANEL_SECTIONS)).toEqual(["page", "effects", "layers", "color"]);
  });

  it("gives every effect a row to be switched off by", () => {
    const items = PANEL_SECTIONS.flatMap((section) =>
      section.items.map((item) => item.id),
    );
    for (const effect of EFFECTS) {
      expect(items).toContain(effectItemId(effect.kind));
    }
  });

  it("namespaces every item id, so two sections can't collide", () => {
    const items = PANEL_SECTIONS.flatMap((section) =>
      section.items.map((item) => item.id),
    );
    expect(new Set(items).size).toBe(items.length);
    for (const id of items) expect(id).toContain(":");
  });
});

describe("orderedSections", () => {
  it("shows the shipped order when the user has said nothing", () => {
    expect(ids(orderedSections([]))).toEqual(ids(PANEL_SECTIONS));
  });

  it("puts colour back above the stack for someone who works that way", () => {
    expect(
      ids(orderedSections(["page", "effects", "color", "layers"])),
    ).toEqual(["page", "effects", "color", "layers"]);
  });

  it("keeps a section the stored order has never heard of", () => {
    expect(ids(orderedSections(["color", "page"]))).toContain("layers");
  });
});

describe("switching things off", () => {
  it("reads an id that isn't on the hidden list as on", () => {
    expect(isItemOn([], "page:resize")).toBe(true);
    expect(isItemOn(["page:resize"], "page:resize")).toBe(false);
  });

  it("leaves a section out once its last row is switched off", () => {
    const effects = PANEL_SECTIONS.find((s) => s.id === "effects")!;
    const every = effects.items.map((item) => item.id);
    expect(itemsOn(effects, every)).toEqual([]);
    expect(sectionHasContent(effects, every)).toBe(false);
    expect(ids(visibleSections([], [], every))).not.toContain("effects");
  });

  it("keeps the stack when its own controls are all off", () => {
    // The list of layers *is* that section: switch off the eye, the padlock,
    // the arrows and the bin and there is still a stack to read and a layer to
    // pick. Only switching the section off takes it away.
    const layers = PANEL_SECTIONS.find((s) => s.id === "layers")!;
    const every = layers.items.map((item) => item.id);
    expect(sectionHasContent(layers, every)).toBe(true);
    expect(ids(visibleSections([], [], every))).toContain("layers");
  });

  it("takes a switched-off section out of the panel", () => {
    expect(ids(visibleSections([], ["color"], []))).toEqual([
      "page",
      "effects",
      "layers",
    ]);
  });

  it("keeps the fixed sections when every section is off", () => {
    // Switching everything off leaves the page's own section standing: it is
    // the only way to resize a drawing or to empty one, and there is no second
    // route to either.
    expect(ids(visibleSections([], ids(PANEL_SECTIONS), []))).toEqual(["page"]);
  });

  it("refuses to switch off what nothing else can reach", () => {
    // The page's section and its bin are `fixed`: a stored list naming them —
    // written by a build that let them go, or edited by hand — is ignored
    // rather than obeyed.
    const page = PANEL_SECTIONS.find((s) => s.id === "page")!;
    expect(page.fixed).toBe(true);
    expect(isSectionOn(["page"], page)).toBe(true);
    expect(isItemOn(["page:reset"], "page:reset")).toBe(true);
    expect(ids(visibleSections([], ["page"], ["page:reset"]))).toContain(
      "page",
    );
  });

  it("still lets the page's other rows go", () => {
    expect(isItemOn(["page:mirror"], "page:mirror")).toBe(false);
    // …but the section outlives them: the bin cannot be switched off, so the
    // section is never emptied out a row at a time either.
    const page = PANEL_SECTIONS.find((s) => s.id === "page")!;
    const every = page.items.map((item) => item.id);
    expect(itemsOn(page, every).map((item) => item.id)).toEqual(["page:reset"]);
    expect(sectionHasContent(page, every)).toBe(true);
  });

  it("marks the stack as costing the document to switch off", () => {
    // The one section whose absence is more than a hiding — the drawings are
    // merged down to a layer each — so the settings row has a line to ask with.
    const layers = PANEL_SECTIONS.find((s) => s.id === "layers")!;
    expect(layers.offConfirmKey).toBeTruthy();
    expect(PANEL_SECTIONS.filter((s) => s.offConfirmKey)).toHaveLength(1);
  });

  it("hides and reorders at the same time", () => {
    expect(
      ids(
        visibleSections(
          ["layers", "page", "effects", "color"],
          ["effects"],
          [],
        ),
      ),
    ).toEqual(["layers", "page", "color"]);
  });
});
