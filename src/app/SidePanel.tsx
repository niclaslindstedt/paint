// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, type ReactNode } from "react";

import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";
import { useDragDrop } from "@niclaslindstedt/oss-framework/sidebar";

import type { EffectKind } from "./effects.ts";
import { useT } from "./i18n/index.ts";
import { EffectsSection } from "./panel/EffectsSection.tsx";
import { LayersSection } from "./panel/LayersSection.tsx";
import { PageSection } from "./panel/PageSection.tsx";
import { orderedSections, visibleSections } from "./panelSections.ts";
import type { BitmapTurn, PageEdit } from "./transform.ts";
import type { Drawing } from "./types.ts";
import type { AppSettings } from "./useAppSettings.ts";
import type { PaintStore } from "./usePaintStore.ts";

// The right-hand panel: what you can do to the *drawing* rather than to a mark.
// Four sections — the page actions, the effects, the layer stack, and the colour
// adjustments — and this file is the shell they sit in rather than the sections
// themselves, which are `panel/`'s.
//
// **Above all four is the Contextual block**, which is not a section and is not
// arranged with them: it holds what can be done to the thing the *screen* is
// holding this second, it is there only while that thing is, and it says so by
// being the one blue, slowly breathing thing in the panel. See the block itself
// below for why that is worth a colour of its own.
//
// **The order is the user's, not the build's.** The sections are dragged into
// place by the grip on their headings, switched off entirely, and thinned out a
// function at a time from Settings → Panel. What exists, where it sits and what
// is left in it are all `panelSections.ts`'s to say — a pure module with no JSX
// in it — and this file renders whatever that hands it, in whatever order it
// comes. The one place a section is named is the line below that picks which
// component paints it; nothing else here, and nothing in `panel/`, asks which
// section it is looking at.
//
// Out of the box the order is page, effects, layers, colour. Colour is under
// the stack because it is what you do to a picture that is *finished*, while
// the three above it are what you reach for mid-drawing — and the stack is what
// you open this panel for while you draw, so six adjustments you touch once
// should not sit between you and it. Anyone who works the other way round drags
// it back up in a second.
//
// **Every section folds away.** Pressing its heading collapses it, and takes the
// heading's own buttons with it. Which is open is remembered per device, not per
// drawing: it is a working posture ("I'm reordering layers, get the rest out of
// the way"), not a property of the page.
//
// **It docks where there is room and floats where there isn't.** On a wide
// screen it is a column of its own beside the canvas, there by default because a
// panel you have to summon is one you forget you have — though the header's
// panel button folds that column away for a drawing you want the full width for;
// on a phone it comes in on a swipe from the right edge (or the same button),
// floats over the page, and a press anywhere on the canvas closes it again — the
// scrim that does that lives in `CanvasScreen`, which owns the space the panel
// floats in. The two modes differ by one prop: there is no second component and
// no second set of behaviour to keep in step.
//
// **There is no close button.** The panel has exactly one switch — the header's
// side-panel button — and it is the same button whether the panel is showing or
// not, so it is where the hand goes back to. A cross of its own was a second
// answer to a question that already had one, and it spent a corner of a
// 224-pixel panel saying what the button beside it says. Escape and a press on
// the page still dismiss it, as they do for every floating surface here.

/** One contextual action — a row of the **Contextual** block at the head of the
 *  panel. Plain strings rather than catalog keys, because what exists depends
 *  on what the *screen* is holding (a selection, today) and the screen is where
 *  the words are resolved. */
export type PanelAction = {
  id: string;
  label: string;
  /** The one line under the pointer saying what it does. */
  hint?: string;
  icon?: ReactNode;
  onSelect: () => void;
};

type Props = {
  store: PaintStore;
  drawing: Drawing;
  /** The page's colours, as the canvas resolved them — the previews paint on
   *  the same sheet the drawing does. */
  pageColor: string;
  defaultInk: string;
  /** Which sections the panel shows, in which order, and what is left in each
   *  of them (see `panelSections.ts`). */
  settings: AppSettings;
  /** Move a section within that order — what a dropped drag resolves to. It is
   *  handed the whole order it is a permutation of, for the reason `order.ts`
   *  gives. */
  onMoveSection: (order: readonly string[], from: number, to: number) => void;
  /** What can be done to the thing the screen is holding *right now* — the
   *  **Contextual** block at the very top of the panel (see `PanelAction`).
   *  Contextual, so it is none of the arrangeable sections' business: it is not
   *  in the stored order, not switchable from Settings → Panel, and the panel
   *  leaves it out entirely — heading and all — when there is nothing to do. */
  actions?: readonly PanelAction[];
  /** Docked beside the canvas rather than floating over it. A docked panel has
   *  no close button and no Escape: it is part of the screen, not a thing you
   *  opened. */
  docked?: boolean;
  /** Open the resize dialog. Owned by the screen, like every other dialog. */
  onResize: () => void;
  /** Start a crop: the rectangle goes up over the canvas, which is the screen's
   *  space rather than this panel's (see `CanvasScreen`). */
  onCrop: () => void;
  /** Open one effect's options. The dialog is the screen's, like the resize
   *  one — this panel says which effect, and nothing else about it. */
  onEffect: (kind: EffectKind) => void;
  /** Open the merge-layers dialog — the screen's too, for the same reason. */
  onMerge: () => void;
  /** Turn the page around (see `transform.ts`). Routed through the screen
   *  rather than straight to the store because a transform that changes the
   *  page's shape also changes what the *view* should be looking at, and the
   *  view is the screen's. */
  onTransform: (
    edit: (drawing: Drawing, bitmap: BitmapTurn) => PageEdit,
  ) => void;
  onClose: () => void;
};

/** Which sections the panel remembers as folded, and where. One key for the
 *  panel rather than one per section: it is read and written together, and a
 *  list of closed ids is what a new section should join *open*. */
const PANEL_FOLDED_KEY = "paint:panel:folded";

export function SidePanel({
  store,
  drawing,
  pageColor,
  defaultInk,
  settings,
  onMoveSection,
  actions = [],
  docked = false,
  onResize,
  onCrop,
  onEffect,
  onMerge,
  onTransform,
  onClose,
}: Props) {
  const t = useT();
  // Which sections are folded away. Per device rather than per drawing (see the
  // note at the top), and stored as the ids that are *closed*, so a build that
  // adds a section opens it for everyone rather than hiding it from the people
  // who happen to have this key already.
  const [folded, setFolded] = useLocalStorageState<string[]>(
    PANEL_FOLDED_KEY,
    [],
  );
  const isOpen = (id: string) => !folded.includes(id);
  const toggle = useCallback(
    (id: string) =>
      setFolded((held) =>
        held.includes(id) ? held.filter((x) => x !== id) : [...held, id],
      ),
    [setFolded],
  );

  // Escape closes the panel, like every other transient surface in the app —
  // but only while it *is* one. A docked panel has nothing to close.
  useEffect(() => {
    if (docked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [docked, onClose]);

  // The whole order, including the sections that are switched off: a move is a
  // permutation of *that*, not of what happens to be showing, or switching a
  // section back on would find it somewhere nobody put it.
  const order = orderedSections(settings.panelOrder).map(
    (section) => section.id,
  );
  const sections = visibleSections(
    settings.panelOrder,
    settings.hiddenPanelSections,
    settings.hiddenPanelItems,
  );

  // Dragging a section by its grip. The framework hook owns the gesture —
  // recognising it, following the pointer, hit-testing the zones — and the only
  // domain question it asks here is the trivial one: a section may land on any
  // section but itself. The same hook the drawings menu reorders with, so a
  // lift feels the same in both panels (a drag on a mouse, a long press on a
  // finger, and vertical scrolling still works through it).
  const dnd = useDragDrop<string, string>({
    canDrop: (drag, target) => drag !== target,
    onDrop: (drag, target) =>
      onMoveSection(order, order.indexOf(drag), order.indexOf(target)),
  });
  // Nowhere to move the only section there is.
  const movable = sections.length > 1;

  return (
    <aside
      {...(docked ? {} : { role: "dialog" })}
      aria-label={t("layers.title")}
      className={
        docked
          ? "relative flex w-56 shrink-0 flex-col overflow-y-auto overscroll-contain border-l border-line bg-surface"
          : "absolute inset-y-0 right-0 z-20 flex w-56 max-w-[80%] flex-col overflow-y-auto overscroll-contain border-l border-line bg-surface shadow-2xl"
      }
    >
      {/* **Contextual** — the block above everything the user arranges: what
          can be done to the thing the screen is holding right now (a
          selection's invert and the cut through it, today). It exists only
          while there is something to do, so an empty page never shows a
          heading over nothing, and it sits at the top because it is about
          *now* where the sections are about the page.

          It is blue and it breathes, and neither is decoration. Everything
          else in this panel is *always there*: you learn where it sits and
          stop looking at it. These rows are the opposite — they appeared
          because of what you just did, they will go when you let go of it, and
          a panel you have stopped reading is exactly where a row that arrives
          for two seconds gets missed. So the block does not sit at the panel's
          own temperature: it carries the one colour nothing else here uses,
          and a slow pulse that says *this is new, and it is about what you are
          holding*. Subtle enough to sit beside a drawing — a breath every
          three seconds, not a blink — and it stands still for anyone who has
          asked for reduced motion (see `styles.css`). */}
      {actions.length > 0 && (
        <div className="panel-contextual shrink-0 border-b border-line">
          <div className="flex items-center gap-1 px-2 py-1.5">
            <span className="panel-contextual-title min-w-0 flex-1 truncate text-xs font-bold tracking-wide uppercase">
              {t("panel.contextualTitle")}
            </span>
          </div>
          <div className="flex flex-col gap-1 px-2 pb-2">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={action.onSelect}
                title={action.hint}
                className="panel-contextual-row flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm"
              >
                {action.icon && (
                  <span className="shrink-0 opacity-80">{action.icon}</span>
                )}
                <span className="min-w-0 flex-1 truncate text-left">
                  {action.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sections.map((section) => {
        const open = isOpen(section.id);
        const zone = dnd.dropZone(section.id, section.id);
        const lifted = dnd.dragging === section.id;
        // The stack is the one section that takes the room that is left: it is
        // a list of unknown length, and the sections around it are a handful of
        // rows each.
        //
        // It gives that room back when the panel is short — but only **down to
        // a floor**, and the floor is why the panel scrolls at all. Squeezed to
        // nothing it did not vanish quietly: its list has a scroll of its own,
        // so the box collapsed while the row under the list (the merge button,
        // the note before it) kept its height and printed itself over the next
        // section's heading. A panel of eight colour adjustments on a laptop is
        // enough to do it. So the stack keeps a couple of rows and a footer's
        // worth of height whatever else is showing, and anything that then
        // doesn't fit is reached by scrolling the panel rather than by drawing
        // two things in one place.
        const stretch =
          open && !section.madeOfItems
            ? "flex min-h-44 flex-1 flex-col"
            : "shrink-0";
        const shared = {
          section,
          open,
          onToggle: () => toggle(section.id),
          hiddenItems: settings.hiddenPanelItems,
          drag: movable ? dnd.dragHandle(section.id) : undefined,
          dragging: lifted,
        };
        return (
          <div
            key={section.id}
            ref={zone.ref}
            className={`${stretch} border-b border-line ${
              lifted ? "opacity-40" : ""
            } ${zone.isOver ? "bg-accent/10 shadow-[inset_0_2px_0_var(--color-accent)]" : ""}`}
          >
            {section.id === "page" ? (
              <PageSection
                {...shared}
                store={store}
                drawing={drawing}
                onResize={onResize}
                onCrop={onCrop}
                onEffect={onEffect}
                onTransform={onTransform}
              />
            ) : section.id === "layers" ? (
              <LayersSection
                {...shared}
                store={store}
                drawing={drawing}
                pageColor={pageColor}
                defaultInk={defaultInk}
                onMerge={onMerge}
              />
            ) : (
              <EffectsSection {...shared} onEffect={onEffect} />
            )}
          </div>
        );
      })}

      {/* Switch every section off and the panel is an empty column, which reads
          as a bug rather than as a choice — so it says which page put it that
          way and can put it back. */}
      {sections.length === 0 && (
        <p className="px-3 py-3 text-[11px] leading-snug text-muted">
          {t("settings.panel.empty")}
        </p>
      )}
    </aside>
  );
}
