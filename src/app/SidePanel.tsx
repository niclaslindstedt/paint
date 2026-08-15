// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState, type ReactNode } from "react";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  ConfirmDialog,
  PlusIcon,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";

import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MirrorHorizontalIcon,
  MirrorVerticalIcon,
  ResizeIcon,
  TurnLeftIcon,
  TurnRightIcon,
  UnlockIcon,
} from "./icons.tsx";
import {
  FILTERS,
  filterOf,
  filterReadout,
  layerFilterOf,
  type FilterTarget,
} from "./filters.ts";
import { useT } from "./i18n/index.ts";
import {
  BACKGROUND_LAYER_ID,
  canDeleteLayer,
  canMoveLayerTo,
  drawingLayers,
  groupByLayer,
  isLocked,
  nextLayerName,
} from "./layers.ts";
import { LayerThumbnail } from "./LayerThumbnail.tsx";
import {
  mirrorDrawing,
  turnDrawing,
  type BitmapTurn,
  type PageEdit,
} from "./transform.ts";
import type { Drawing } from "./types.ts";
import type { PaintStore } from "./usePaintStore.ts";

// The right-hand panel: what you can do to the *drawing* rather than to a mark.
// Three sections, in the order you reach for them — the page actions (resize,
// flip, mirror) at the top, the page's filters under them, and the layer stack
// under those, topmost first, the way every drawing app has shown a stack since
// the idea existed.
//
// **It docks where there is room and floats where there isn't.** On a wide
// screen it is a column of its own beside the canvas, always there, because a
// panel you have to summon is one you forget you have; on a phone it comes in on
// a swipe from the right edge (or the header button), floats over the page, and
// a press anywhere on the canvas closes it again — the scrim that does that
// lives in `CanvasScreen`, which owns the space the panel floats in. The two
// modes differ by one prop: there is no second component and no second set of
// behaviour to keep in step.
//
// **There is no close button.** The panel has exactly one switch — the header's
// side-panel button — and it is the same button whether the panel is showing or
// not, so it is where the hand goes back to. A cross of its own was a second
// answer to a question that already had one, and it spent a corner of a
// 224-pixel panel saying what the button beside it says. Escape and a press on
// the page still dismiss it, as they do for every floating surface here.
//
// The page actions are at the top because they are the ones with a *destination*
// — you open the panel to resize, where you open it to pick a layer while you
// are already drawing. They are three rows of paired buttons rather than a menu:
// each pair is one decision (which way?), and both halves are one tap.
//
// The bin lives up there too, at the far end of the section's own heading.
// Throwing a drawing away is an action on the *document* — every mark, every
// layer, and the page colour with them — so it belongs beside resize and flip
// rather than hung off the eraser, which is where it used to be. It is at the
// end of the heading rather than in the run of buttons below for the same
// reason it is a small glyph rather than a row: something you can hit by
// accident on the way to "flip" is not where the irreversible thing goes.
//
// Actions hang off the *selected* row rather than every row. A layer stack is a
// list you pick from far more often than you reorder, and four glyphs on every
// row of a 224-pixel panel is a row you can't read and can't hit. Picking a
// layer is one tap; what you can then do to it is right under your thumb.
//
// The two exceptions are the eye and the padlock, which sit on every row. Both
// are switches rather than actions — you read them as much as you press them —
// and the padlock has to be reachable on a row that *cannot be selected*,
// which is the whole point of a lock: the sheet at the bottom of a fresh
// drawing is locked, and the only way back to it is the glyph on its own row.
//
// Each row carries a **preview of its marks** (`LayerThumbnail`) rather than a
// count of them. The count answered the wrong question — you open this panel to
// find which layer holds the labels, not how many strokes are in it — so the
// number survives only where it is genuinely the point: the prompt that warns
// you how much a delete is about to take. It is still read out to a screen
// reader, which the picture is no use to.
//
// Everything here is a pure function of the drawing plus the store's actions —
// no layer state of its own beyond the delete confirmation.

type Props = {
  store: PaintStore;
  drawing: Drawing;
  /** The page's colours, as the canvas resolved them — the previews paint on
   *  the same sheet the drawing does. */
  pageColor: string;
  defaultInk: string;
  /** Docked beside the canvas rather than floating over it. A docked panel has
   *  no close button and no Escape: it is part of the screen, not a thing you
   *  opened. */
  docked?: boolean;
  /** Open the resize dialog. Owned by the screen, like every other dialog. */
  onResize: () => void;
  /** Open one filter's options. The dialog is the screen's, like the resize
   *  one — this panel says which filter, and nothing else about it. */
  onFilter: (target: FilterTarget) => void;
  /** Turn the page around (see `transform.ts`). Routed through the screen
   *  rather than straight to the store because a transform that changes the
   *  page's shape also changes what the *view* should be looking at, and the
   *  view is the screen's. */
  onTransform: (
    edit: (drawing: Drawing, bitmap: BitmapTurn) => PageEdit,
  ) => void;
  onClose: () => void;
};

/** One of the panel's square glyph buttons. */
function PanelButton({
  label,
  onClick,
  disabled,
  pressed,
  tone = "muted",
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  tone?: "muted" | "danger";
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-surface-2 hover:text-fg-bright disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent ${
        tone === "danger" ? "text-muted hover:text-danger" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function SidePanel({
  store,
  drawing,
  pageColor,
  defaultInk,
  docked = false,
  onResize,
  onFilter,
  onTransform,
  onClose,
}: Props) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

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

  const layers = drawingLayers(drawing);
  const marks = groupByLayer(drawing);
  const selected = layers.find(
    (l) => l.id === drawing.activeLayerId && !isLocked(l),
  );
  const activeId = (
    selected ??
    [...layers].reverse().find((l) => !isLocked(l)) ??
    layers[layers.length - 1]!
  ).id;

  /** A layer's display name. Two layers can be nameless, and they are the two
   *  every drawing starts with: the sheet at the bottom, and the layer above it
   *  that holds the marks of a drawing nobody has added a layer to. */
  const nameOf = (layer: { id: string; name: string }) =>
    layer.name.trim() ||
    (layer.id === BACKGROUND_LAYER_ID
      ? t("layers.background")
      : t("layers.base"));

  const doomed = layers.find((l) => l.id === confirmDelete);
  // Nothing to throw away: no marks, no stack of its own, and a page still
  // following the canvas theme.
  const untouched =
    drawing.strokes.length === 0 &&
    !drawing.layers &&
    drawing.background === undefined;

  return (
    <aside
      {...(docked ? {} : { role: "dialog" })}
      aria-label={t("layers.title")}
      className={
        docked
          ? "relative flex w-56 shrink-0 flex-col border-l border-line bg-surface"
          : "absolute inset-y-0 right-0 z-20 flex w-56 max-w-[80%] flex-col border-l border-line bg-surface shadow-2xl"
      }
    >
      {/* What you can do to the whole drawing. First because it is what you
          come here *for*; the stack below is what you come here with. */}
      <div className="shrink-0 border-b border-line">
        <div className="flex items-center gap-1 px-2 py-1.5">
          <span className="flex-1 pl-1 text-xs font-bold tracking-wide text-muted uppercase">
            {t("page.title")}
          </span>
          {/* Start over: every mark, every layer and the page colour, gone in
              one undoable step. Dim on a drawing that is already blank, so the
              bin can't offer to throw away nothing. */}
          <PanelButton
            label={t("page.reset")}
            tone="danger"
            disabled={untouched}
            onClick={() => setConfirmReset(true)}
          >
            <TrashIcon className="h-4 w-4" />
          </PanelButton>
        </div>
        <div className="flex flex-col gap-1 px-2 pb-2">
          <button
            type="button"
            onClick={onResize}
            className="flex cursor-pointer items-center gap-2 rounded border border-line px-2 py-1.5 text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
          >
            <ResizeIcon className="h-4 w-4 shrink-0 text-muted" />
            <span className="min-w-0 flex-1 truncate text-left">
              {t("page.resize")}
            </span>
            <span className="shrink-0 text-[11px] text-muted tabular-nums">
              {drawing.width} × {drawing.height}
            </span>
          </button>

          <ActionPair label={t("page.flip")}>
            <ActionButton
              label={t("page.left")}
              title={t("page.flipLeft")}
              onClick={() =>
                onTransform((d, bitmap) => turnDrawing(d, "left", bitmap))
              }
            >
              <TurnLeftIcon className="h-4 w-4" />
            </ActionButton>
            <ActionButton
              label={t("page.right")}
              title={t("page.flipRight")}
              onClick={() =>
                onTransform((d, bitmap) => turnDrawing(d, "right", bitmap))
              }
            >
              <TurnRightIcon className="h-4 w-4" />
            </ActionButton>
          </ActionPair>

          <ActionPair label={t("page.mirror")}>
            <ActionButton
              label={t("page.horizontal")}
              title={t("page.mirrorHorizontal")}
              onClick={() =>
                onTransform((d, bitmap) =>
                  mirrorDrawing(d, "horizontal", bitmap),
                )
              }
            >
              <MirrorHorizontalIcon className="h-4 w-4" />
            </ActionButton>
            <ActionButton
              label={t("page.vertical")}
              title={t("page.mirrorVertical")}
              onClick={() =>
                onTransform((d, bitmap) => mirrorDrawing(d, "vertical", bitmap))
              }
            >
              <MirrorVerticalIcon className="h-4 w-4" />
            </ActionButton>
          </ActionPair>
        </div>
      </div>

      {/* What the page is *seen through*. A section of its own, between the
          actions that change the drawing and the stack that holds it, because
          that is what a filter sits between: it is not an edit to any mark, and
          it is not one of the layers — it is the whole page, looked at
          differently.

          Each row is a filter, and the number on the right is how much of it
          there is (or **Off**). No glyphs: a blur and a grain are hard to tell
          apart at 16 pixels, and the value already says which rows are doing
          something. Pressing one opens its options — every filter has some, and
          a filter switched on at a strength nobody chose is a filter that will
          be switched straight off again. */}
      <div className="shrink-0 border-b border-line px-2 py-1.5">
        <span className="block pb-1.5 pl-1 text-xs font-bold tracking-wide text-muted uppercase">
          {t("filters.title")}
        </span>
        <div className="flex flex-col gap-1">
          {FILTERS.map((descriptor) => {
            const filter = filterOf(drawing, descriptor.kind);
            return (
              <button
                key={descriptor.kind}
                type="button"
                onClick={() => onFilter({ kind: descriptor.kind })}
                title={t(descriptor.hintKey)}
                aria-label={t("filters.open", {
                  name: t(descriptor.nameKey),
                })}
                className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-sm hover:bg-surface-2 hover:text-fg-bright ${
                  filter
                    ? "border-accent bg-accent/10 text-fg-bright"
                    : "border-line text-fg"
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {t(descriptor.nameKey)}
                </span>
                <span
                  className={`shrink-0 text-[11px] tabular-nums ${
                    filter ? "text-accent" : "text-muted"
                  }`}
                >
                  {filter ? filterReadout(filter) : t("filters.off")}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <header className="flex shrink-0 items-center gap-1 border-b border-line px-2 py-1.5">
        <span className="flex-1 pl-1 text-xs font-bold tracking-wide text-muted uppercase">
          {t("layers.title")}
        </span>
        <PanelButton
          label={t("layers.add")}
          onClick={() =>
            store.addLayer(
              nextLayerName(layers, (n) =>
                t("layers.numbered", { n: String(n) }),
              ),
            )
          }
        >
          <PlusIcon className="h-4 w-4" />
        </PanelButton>
      </header>

      {/* Topmost first: the list reads the way the marks stack. */}
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {[...layers].reverse().map((layer, fromTop) => {
          const at = layers.length - 1 - fromTop;
          const active = layer.id === activeId;
          const locked = isLocked(layer);
          const strokes = marks.get(layer.id) ?? [];
          const name = nameOf(layer);
          return (
            <li
              key={layer.id}
              className={
                active
                  ? "bg-accent/15 shadow-[inset_3px_0_0_var(--color-accent)]"
                  : ""
              }
            >
              <div className="flex items-center px-1">
                <PanelButton
                  label={
                    layer.hidden
                      ? t("layers.show", { name })
                      : t("layers.hide", { name })
                  }
                  pressed={!layer.hidden}
                  onClick={() => store.setLayerHidden(layer.id, !layer.hidden)}
                >
                  {layer.hidden ? (
                    <EyeOffIcon className="h-4 w-4" />
                  ) : (
                    <EyeIcon className="h-4 w-4 text-fg" />
                  )}
                </PanelButton>
                {/* The padlock. On every row, and on a locked row it is the
                    only live control there is — the row itself refuses the
                    press that would select it. */}
                <PanelButton
                  label={
                    locked
                      ? t("layers.unlock", { name })
                      : t("layers.lock", { name })
                  }
                  pressed={locked}
                  onClick={() => store.setLayerLocked(layer.id, !locked)}
                >
                  {locked ? (
                    <LockIcon className="h-4 w-4 text-fg" />
                  ) : (
                    <UnlockIcon className="h-4 w-4" />
                  )}
                </PanelButton>
                <button
                  type="button"
                  onClick={() => store.selectLayer(layer.id)}
                  disabled={locked}
                  aria-current={active ? "true" : undefined}
                  title={
                    locked
                      ? t("layers.lockedHint", { name })
                      : t("layers.select", { name })
                  }
                  className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 text-left ${
                    locked ? "cursor-default" : "cursor-pointer"
                  } ${layer.hidden ? "opacity-40" : ""}`}
                >
                  <LayerThumbnail
                    drawing={drawing}
                    strokes={strokes}
                    pageColor={pageColor}
                    defaultInk={defaultInk}
                  />
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${
                      active ? "font-bold text-fg-bright" : "text-fg"
                    }`}
                  >
                    {name}
                  </span>
                  {/* The count the preview replaced, kept for the readers a
                      picture says nothing to. */}
                  <span className="sr-only">
                    {strokes.length === 0
                      ? t("layers.empty")
                      : t("layers.marks", { n: String(strokes.length) })}
                  </span>
                </button>
              </div>

              {/* What you can do to the layer you have picked. */}
              {active && (
                <>
                  {/* The layer's own filters, in the rows the page's Filters
                      section uses — same wording, same readout, same dialog —
                      so "blur this layer" and "blur the page" read as one
                      idea at two scopes rather than as two features.

                      Only on the selected row: a filter per layer on every row
                      would double the height of the stack for something you
                      reach for once a drawing. */}
                  <div className="flex gap-1 px-1.5 pb-1">
                    {FILTERS.map((descriptor) => {
                      const on = layerFilterOf(
                        drawing,
                        layer.id,
                        descriptor.kind,
                      );
                      return (
                        <button
                          key={descriptor.kind}
                          type="button"
                          onClick={() =>
                            onFilter({
                              kind: descriptor.kind,
                              layerId: layer.id,
                            })
                          }
                          title={t(descriptor.hintKey)}
                          aria-label={t("filters.openOnLayer", {
                            name: t(descriptor.nameKey),
                            layer: name,
                          })}
                          className={`flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded border px-1.5 py-1 text-[11px] hover:bg-surface-2 hover:text-fg-bright ${
                            on
                              ? "border-accent bg-accent/10 text-fg-bright"
                              : "border-line text-muted"
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate text-left">
                            {t(descriptor.nameKey)}
                          </span>
                          <span
                            className={`shrink-0 tabular-nums ${
                              on ? "text-accent" : "text-muted"
                            }`}
                          >
                            {on ? filterReadout(on) : t("filters.off")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center justify-end gap-0.5 px-1.5 pb-1">
                    {/* Where a layer may go is `layers.ts`'s to say, and it says
                      two things: not off the ends of the stack, and never
                      under the sheet — which is also why the sheet's own row
                      offers no arrows at all. */}
                    <PanelButton
                      label={t("layers.moveUp", { name })}
                      disabled={!canMoveLayerTo(drawing, layer.id, at + 1)}
                      onClick={() => store.moveLayer(layer.id, at + 1)}
                    >
                      <ChevronUpIcon className="h-4 w-4" />
                    </PanelButton>
                    <PanelButton
                      label={t("layers.moveDown", { name })}
                      disabled={!canMoveLayerTo(drawing, layer.id, at - 1)}
                      onClick={() => store.moveLayer(layer.id, at - 1)}
                    >
                      <ChevronDownIcon className="h-4 w-4" />
                    </PanelButton>
                    <PanelButton
                      label={t("layers.delete", { name })}
                      tone="danger"
                      // What may not be deleted is `layers.ts`'s to say — the
                      // last layer, a locked one, or the last one still taking
                      // marks. Emptying a drawing outright is Start over's job.
                      disabled={!canDeleteLayer(drawing, layer.id)}
                      onClick={() => {
                        if (strokes.length === 0) store.deleteLayer(layer.id);
                        else setConfirmDelete(layer.id);
                      }}
                    >
                      <TrashIcon className="h-4 w-4" />
                    </PanelButton>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {/* How marks find their layer — and, on a phone, the gesture that opened
          this. A docked panel was never opened, so it says only the half that
          is still true. */}
      <p className="shrink-0 border-t border-line px-3 py-2 text-[11px] leading-snug text-muted">
        {docked
          ? t("layers.hint")
          : `${t("layers.hint")} ${t("layers.swipeHint")}`}
      </p>

      {/* Losing a layer loses every mark on it. Undo brings both back, but the
          marks are out of sight in the panel, so the count goes in the prompt —
          "and the 40 marks on it" is the part worth reading. */}
      <ConfirmDialog
        open={doomed !== undefined}
        title={t("layers.delete", { name: doomed ? nameOf(doomed) : "" })}
        description={t("layers.deleteConfirm", {
          name: doomed ? nameOf(doomed) : "",
          n: String(doomed ? (marks.get(doomed.id)?.length ?? 0) : 0),
        })}
        confirmLabel={t("common.delete")}
        tone="danger"
        onConfirm={() => {
          if (confirmDelete) store.deleteLayer(confirmDelete);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Starting over takes more than a delete does — every layer as well as
          every mark — so the prompt says so rather than asking "are you sure?". */}
      <ConfirmDialog
        open={confirmReset}
        title={t("page.reset")}
        description={t("page.resetConfirm")}
        confirmLabel={t("page.resetConfirmLabel")}
        tone="danger"
        onConfirm={() => {
          store.resetActive();
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </aside>
  );
}

/** One labelled pair of page actions — "Flip: left / right". The label is part
 *  of the row rather than a heading over it: two words and two buttons fit on
 *  one line of a 224-pixel panel, and a heading per pair would double the
 *  section's height for no more meaning. */
function ActionPair({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="min-w-0 flex-1 truncate pl-0.5 text-sm text-fg">
        {label}
      </span>
      <div className="flex shrink-0 gap-1">{children}</div>
    </div>
  );
}

/** One half of a pair: a glyph that says which way, and the word under the
 *  pointer for the half that isn't obvious from the mark. */
function ActionButton({
  label,
  title,
  onClick,
  children,
}: {
  label: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      title={`${label} — ${title}`}
      className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-line text-muted hover:bg-surface-2 hover:text-fg-bright"
    >
      {children}
    </button>
  );
}
