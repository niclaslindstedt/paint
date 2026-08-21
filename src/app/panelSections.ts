// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What the right-hand panel is made of — its sections, and the individual
// things inside each one — as data rather than as JSX.
//
// The panel used to be four blocks written out in order in `SidePanel.tsx`, and
// that order was the build's. It is the user's now: the sections can be dragged
// into the arrangement that suits the work, switched off entirely for the ones a
// given person never reaches for, and thinned out a function at a time
// (Settings → Panel). None of that is expressible while the order is the order
// statements appear in a component, so it moved here.
//
// The shape is deliberately the plugin registry's, one floor down: a list of
// descriptors, a stored list of ids that says how they are arranged, and a
// stored list of ids that says which are off. `SidePanel` renders whatever this
// module hands it and knows nothing else about which sections exist — the same
// "no screen branches on an id" rule the tools follow.
//
// Pure and DOM-free, so the whole arrangement can be driven in a node test: the
// marks each row wears are the settings tab's business, not this module's.

import { EFFECT_GROUPS, EFFECTS, type EffectGroup } from "./effects.ts";
import type { TKey } from "./i18n/index.ts";
import { orderById } from "./order.ts";

/** One switchable thing inside a section — a page action, an effect, one of the
 *  controls on a layer row.
 *
 *  Ids are namespaced by what they are (`page:`, `effect:`, `layers:`) because
 *  they are **persisted**: they go into the settings file as the list of things
 *  a user has switched off, and a bare `delete` would collide the moment two
 *  sections both had one. Renaming one forgets that choice, so don't. */
export type PanelItem = {
  id: string;
  nameKey: TKey;
  hintKey: TKey;
  /** Not switchable — the panel shows it whatever the settings say (see
   *  {@link PanelSection.fixed}). */
  fixed?: boolean;
};

/** One section of the panel: a heading, what it holds, and whether it can be
 *  switched off at all. */
export type PanelSection = {
  id: string;
  titleKey: TKey;
  /** One line for the settings row — what switching this off costs you. */
  hintKey: TKey;
  /** The things inside it that can be switched off one at a time. */
  items: readonly PanelItem[];
  /**
   * Whether the section is *made of* those items and nothing else. Such a
   * section with every item switched off has nothing left to show, so the panel
   * leaves it out rather than printing a heading over an empty box.
   *
   * The layer stack is the exception: the list of layers is the section, and its
   * items are only what you can *do* to a row — switch all five off and there is
   * still a stack to read and a layer to pick.
   */
  madeOfItems: boolean;
  /**
   * Whether this section can be switched off at all.
   *
   * A fixed one cannot: it is how you get at the *document* rather than a
   * convenience over it, and there is no other way to reach what it holds. The
   * page's own section is the one that is — resizing the sheet, turning it, and
   * starting the drawing over are not preferences, and a panel that had been
   * switched down to nothing would leave a drawing with no way to change its
   * size and no way to be emptied.
   *
   * Stored settings are not consulted for one (`visibleSections` keeps it
   * whatever the list says), so a switch flipped by an older build — or a
   * hand-edited settings file — cannot take it away either.
   */
  fixed?: boolean;
  /**
   * What switching this section off costs the *document*, when it costs the
   * document anything. Present only on a section whose absence is more than a
   * hiding, and it is what the settings row asks before it goes: the layer
   * stack's, because a sketchbook with no layers panel is a sketchbook whose
   * drawings are merged down to one layer each.
   */
  offConfirmKey?: TKey;
};

/** The panel's own two sections. The other two come from `EFFECT_GROUPS`, which
 *  already declares them for the effects themselves. */
const PAGE: PanelSection = {
  id: "page",
  titleKey: "page.title",
  hintKey: "settings.panel.pageHint",
  madeOfItems: true,
  // The page itself is not an opinion — see `fixed`.
  fixed: true,
  items: [
    {
      id: "page:resize",
      nameKey: "page.resize",
      hintKey: "settings.panel.resizeHint",
    },
    {
      id: "page:crop",
      nameKey: "page.crop",
      hintKey: "settings.panel.cropHint",
    },
    {
      id: "page:flip",
      nameKey: "page.flip",
      hintKey: "settings.panel.flipHint",
    },
    {
      id: "page:mirror",
      nameKey: "page.mirror",
      hintKey: "settings.panel.mirrorHint",
    },
    {
      id: "page:reset",
      nameKey: "page.reset",
      hintKey: "settings.panel.resetHint",
      // Emptying a drawing is the only way back to a blank page that keeps the
      // page — no tool does it, and deleting the drawing is a different thing
      // to want. It stays for the same reason its section does.
      fixed: true,
    },
  ],
};

const LAYERS: PanelSection = {
  id: "layers",
  titleKey: "layers.title",
  hintKey: "settings.panel.layersHint",
  // The stack survives its items — see `madeOfItems`.
  madeOfItems: false,
  // Switching the stack off is a change to the drawings, not just to the panel.
  offConfirmKey: "settings.panel.layersOffConfirm",
  items: [
    {
      id: "layers:add",
      nameKey: "layers.add",
      hintKey: "settings.panel.addHint",
    },
    {
      id: "layers:visibility",
      nameKey: "settings.panel.layersVisibility",
      hintKey: "settings.panel.layersVisibilityHint",
    },
    {
      id: "layers:lock",
      nameKey: "settings.panel.layersLock",
      hintKey: "settings.panel.layersLockHint",
    },
    {
      id: "layers:reorder",
      nameKey: "settings.panel.layersReorder",
      hintKey: "settings.panel.layersReorderHint",
    },
    {
      id: "layers:delete",
      nameKey: "settings.panel.layersDelete",
      hintKey: "settings.panel.layersDeleteHint",
    },
    {
      id: "layers:merge",
      nameKey: "layers.merge",
      hintKey: "settings.panel.layersMergeHint",
    },
  ],
};

/** The id a given effect is switched off by. */
export function effectItemId(kind: string): string {
  return `effect:${kind}`;
}

/** One effect group, as a section: its rows are the effects in it, so it is
 *  made of them by definition. */
function effectSection(group: {
  id: EffectGroup;
  titleKey: TKey;
}): PanelSection {
  return {
    id: group.id,
    titleKey: group.titleKey,
    hintKey:
      group.id === "color"
        ? "settings.panel.colorHint"
        : group.id === "image"
          ? "settings.panel.imageHint"
          : "settings.panel.effectsHint",
    madeOfItems: true,
    items: EFFECTS.filter((effect) => effect.group === group.id).map(
      (effect) => ({
        id: effectItemId(effect.kind),
        nameKey: effect.nameKey,
        hintKey: effect.hintKey,
      }),
    ),
  };
}

/** The order a fresh install shows the sections in.
 *
 *  **Colour is under the stack**, which is the one place in this list worth
 *  arguing about. The three above it are things you do to the page you are
 *  looking at and reach for mid-drawing; the tonal work is what you do to a
 *  picture that is finished, and burying the layer stack — the section you open
 *  this panel for while you are drawing — under six adjustments you touch once
 *  put the common thing furthest from the hand. Anyone who works the other way
 *  round drags it back up.
 *
 *  A section this list doesn't name (a third effect group, say) follows the ones
 *  it does rather than vanishing. */
const SHIPPED_ORDER = ["page", "effects", "layers", "image", "color"] as const;

const REGISTERED: readonly PanelSection[] = [
  PAGE,
  LAYERS,
  ...EFFECT_GROUPS.map(effectSection),
];

/** Every section, in the order this build ships them. */
export const PANEL_SECTIONS: readonly PanelSection[] = [
  ...SHIPPED_ORDER.map((id) =>
    REGISTERED.find((section) => section.id === id),
  ).filter((section): section is PanelSection => section !== undefined),
  ...REGISTERED.filter(
    (section) => !SHIPPED_ORDER.some((id) => id === section.id),
  ),
];

/** Every section, in the user's own order — what Settings → Panel lists,
 *  switches and reorders. Switched-off sections are in it too: that page is
 *  where they are switched back on. */
export function orderedSections(order: readonly string[]): PanelSection[] {
  return orderById(PANEL_SECTIONS, order);
}

/** The ids nothing can switch off — see {@link PanelSection.fixed}. Built from
 *  the registry rather than written out twice, so marking an item fixed is the
 *  one edit it takes. */
const FIXED_ITEMS: ReadonlySet<string> = new Set(
  PANEL_SECTIONS.flatMap((section) =>
    section.items.filter((item) => item.fixed).map((item) => item.id),
  ),
);

/** Whether one thing inside a section is switched on. Stored as the ids that
 *  are *off*, so an effect a later release adds arrives switched on rather than
 *  hidden from every install that already holds this key.
 *
 *  A fixed item is on whatever the list says: the settings page renders no
 *  switch for one, and a stored id from a build that did is ignored rather than
 *  obeyed. */
export function isItemOn(hiddenItems: readonly string[], id: string): boolean {
  return FIXED_ITEMS.has(id) || !hiddenItems.includes(id);
}

/** Whether a whole section is switched on — the same question, one floor up,
 *  and with the same answer for a fixed one. Both the panel and the settings
 *  page ask it here rather than reading the stored list directly, so "this can't
 *  be switched off" is one rule in one place. */
export function isSectionOn(
  hiddenSections: readonly string[],
  section: PanelSection,
): boolean {
  return section.fixed === true || !hiddenSections.includes(section.id);
}

/** The things inside a section that are still switched on. */
export function itemsOn(
  section: PanelSection,
  hiddenItems: readonly string[],
): PanelItem[] {
  return section.items.filter((item) => isItemOn(hiddenItems, item.id));
}

/** Whether a section has anything left to show — always true for a section that
 *  is more than its items (see `madeOfItems`). */
export function sectionHasContent(
  section: PanelSection,
  hiddenItems: readonly string[],
): boolean {
  return !section.madeOfItems || itemsOn(section, hiddenItems).length > 0;
}

/** The sections the panel actually paints: the ones switched on, in the user's
 *  order, minus any that has been emptied out a row at a time. */
export function visibleSections(
  order: readonly string[],
  hiddenSections: readonly string[],
  hiddenItems: readonly string[],
): PanelSection[] {
  return orderedSections(order).filter(
    (section) =>
      isSectionOn(hiddenSections, section) &&
      sectionHasContent(section, hiddenItems),
  );
}
