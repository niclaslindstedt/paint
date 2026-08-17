// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useState, type ReactNode } from "react";

import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ConfirmDialog,
  PlusIcon,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";
import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";

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
import { EFFECTS, type EffectKind } from "./effects.ts";
import { useT } from "./i18n/index.ts";
import {
  canDeleteLayer,
  canMoveLayerTo,
  drawingLayers,
  groupByLayer,
  isLocked,
  layerDisplayName,
  nextLayerName,
  stackIsReset,
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
// flip, mirror) at the top, the effects under them, and the layer stack under
// those, topmost first, the way every drawing app has shown a stack since the
// idea existed.
//
// **Every section folds away.** Pressing its heading collapses it, and takes the
// heading's own buttons with it — a section that isn't showing has nothing to
// add to or throw away, and leaving the bin sitting next to a folded "Image"
// would be a bin with no visible subject. Which is open is remembered per
// device, not per drawing: it is a working posture ("I'm reordering layers, get
// the rest out of the way"), not a property of the page. The stack is the one
// that earns it most — on a phone the three sections plus a dozen layers is more
// than the column can show at once.
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
// no layer state of its own beyond the delete confirmation and which sections
// are folded.

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
  /** Open one effect's options. The dialog is the screen's, like the resize
   *  one — this panel says which effect, and nothing else about it. */
  onEffect: (kind: EffectKind) => void;
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
const PAGE_SECTION = "page";
const EFFECTS_SECTION = "effects";
const LAYERS_SECTION = "layers";

/** One section's heading: the title, which is also the fold switch, and
 *  whatever buttons belong to the section.
 *
 *  **The buttons go with the section.** A folded "Layers" showing a + would
 *  add a layer to a list you cannot see, and a folded "Image" showing a bin
 *  would offer to throw away a drawing whose actions are hidden — so the
 *  children come out with the body. The chevron is the only thing that stays,
 *  because it is the switch.
 *
 *  The title is a real button spanning the width the buttons don't take, so the
 *  whole heading is the target rather than a glyph at one end of it. */
function SectionHeading({
  title,
  open,
  onToggle,
  className = "",
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  className?: string;
  children?: ReactNode;
}) {
  const t = useT();
  return (
    <div className={`flex items-center gap-1 px-2 py-1.5 ${className}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={
          open
            ? t("panel.collapse", { name: title })
            : t("panel.expand", { name: title })
        }
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-1 rounded pr-1 text-left text-muted hover:text-fg-bright"
      >
        {open ? (
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-bold tracking-wide uppercase">
          {title}
        </span>
      </button>
      {open ? children : null}
    </div>
  );
}

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
  onEffect,
  onTransform,
  onClose,
}: Props) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
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

  const nameOf = (layer: { id: string; name: string }) =>
    layerDisplayName(layer, {
      background: t("layers.background"),
      base: t("layers.base"),
    });

  const doomed = layers.find((l) => l.id === confirmDelete);
  // Nothing to throw away: no marks, and no stack beyond the one starting over
  // would leave. The page's colour and sheet survive a reset — they are what
  // the page is, not what is on it — so neither lights the bin.
  const untouched = drawing.strokes.length === 0 && stackIsReset(drawing);

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
        <SectionHeading
          title={t("page.title")}
          open={isOpen(PAGE_SECTION)}
          onToggle={() => toggle(PAGE_SECTION)}
        >
          {/* Start over: every mark and every layer, gone in one undoable
              step — the page keeps its colour and its sheet. Dim on a drawing
              that is already blank, so the bin can't offer to throw away
              nothing. */}
          <PanelButton
            label={t("page.reset")}
            tone="danger"
            disabled={untouched}
            onClick={() => setConfirmReset(true)}
          >
            <TrashIcon className="h-4 w-4" />
          </PanelButton>
        </SectionHeading>
        {isOpen(PAGE_SECTION) && (
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
                  onTransform((d, bitmap) =>
                    mirrorDrawing(d, "vertical", bitmap),
                  )
                }
              >
                <MirrorVerticalIcon className="h-4 w-4" />
              </ActionButton>
            </ActionPair>
          </div>
        )}
      </div>

      {/* What you can do *to* the marks, once. A section of its own, between
          the actions that change the drawing and the stack that holds it,
          because that is what an effect sits between: it is not one mark's
          edit, and it is not one of the layers — it is a pass over what a layer
          already has on it.

          Each row opens an effect's options; nothing lands from here. The row
          says **Apply…** rather than showing a value, and that is the whole
          difference from what this section used to be: there is no "on" state
          to read back, because an effect that has been applied is simply part
          of the picture.

          Nothing under the rows explains that. A paragraph about flattening sat
          there for a while and it was three lines of a 224-pixel column saying
          what the dialog one press away says at the moment it matters — with the
          layer it is about to land on named, and a preview of what it will
          do. */}
      <div className="shrink-0 border-b border-line">
        <SectionHeading
          title={t("effects.title")}
          open={isOpen(EFFECTS_SECTION)}
          onToggle={() => toggle(EFFECTS_SECTION)}
        />
        {isOpen(EFFECTS_SECTION) && (
          <div className="flex flex-col gap-1 px-2 pb-2">
            {EFFECTS.map((descriptor) => (
              <button
                key={descriptor.kind}
                type="button"
                onClick={() => onEffect(descriptor.kind)}
                title={t(descriptor.hintKey)}
                aria-label={t("effects.open", {
                  name: t(descriptor.nameKey),
                })}
                className="flex cursor-pointer items-center gap-2 rounded border border-line px-2 py-1.5 text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
              >
                <span className="min-w-0 flex-1 truncate text-left">
                  {t(descriptor.nameKey)}
                </span>
                <span className="shrink-0 text-[11px] text-muted">
                  {t("effects.action")}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <SectionHeading
        title={t("layers.title")}
        open={isOpen(LAYERS_SECTION)}
        onToggle={() => toggle(LAYERS_SECTION)}
        className="border-b border-line"
      >
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
      </SectionHeading>

      {/* Topmost first: the list reads the way the marks stack. */}
      {isOpen(LAYERS_SECTION) && (
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
                    onClick={() =>
                      store.setLayerHidden(layer.id, !layer.hidden)
                    }
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

                {/* What you can do to the layer you have picked.
                  Effects are *not* here: they have a section of their own and
                  they read the selected layer from the drawing, so an "apply to
                  this layer" button per row would be the same dialog reached two
                  ways. */}
                {active && (
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
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* How marks find their layer — and, on a phone, the gesture that opened
          this. A docked panel was never opened, so it says only the half that
          is still true. It goes with the stack: it is a note about the list, and
          a folded list has nothing to annotate. */}
      {isOpen(LAYERS_SECTION) && (
        <p className="shrink-0 border-t border-line px-3 py-2 text-[11px] leading-snug text-muted">
          {docked
            ? t("layers.hint")
            : `${t("layers.hint")} ${t("layers.swipeHint")}`}
        </p>
      )}

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
