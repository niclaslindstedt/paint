// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState, type ReactNode } from "react";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  ConfirmDialog,
  PlusIcon,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";

import { EyeIcon, EyeOffIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { drawingLayers, groupByLayer, nextLayerName } from "./layers.ts";
import { LayerThumbnail } from "./LayerThumbnail.tsx";
import type { Drawing } from "./types.ts";
import type { PaintStore } from "./usePaintStore.ts";

// The layers panel: a strip down the right edge of the canvas listing the
// drawing's stack, topmost first — the way every drawing app has shown a stack
// since the idea existed, and the way the marks actually sit on the page.
//
// It is a **temporary** panel rather than a second sidebar. It comes in on a
// swipe from the right edge (or the header button), it floats over the page
// instead of taking width from it, and a press anywhere on the canvas closes it
// again — the scrim that does that lives in `CanvasScreen`, which owns the
// space the panel floats in. Deliberately not a docked column: a phone has no
// width to give one, and the panel is something you visit between strokes, not
// something you draw next to.
//
// Actions hang off the *selected* row rather than every row. A layer stack is a
// list you pick from far more often than you reorder, and four glyphs on every
// row of a 224-pixel panel is a row you can't read and can't hit. Picking a
// layer is one tap; what you can then do to it is right under your thumb.
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

export function LayersPanel({
  store,
  drawing,
  pageColor,
  defaultInk,
  onClose,
}: Props) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Escape closes the panel, like every other transient surface in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const layers = drawingLayers(drawing);
  const marks = groupByLayer(drawing);
  const selected = layers.find((l) => l.id === drawing.activeLayerId);
  const activeId = (selected ?? layers[layers.length - 1]!).id;
  const only = layers.length === 1;

  /** A layer's display name. Only the base can be nameless — it is the layer
   *  every drawing already had before anyone asked for a second one. */
  const nameOf = (name: string) => name.trim() || t("layers.base");

  const doomed = layers.find((l) => l.id === confirmDelete);

  return (
    <aside
      role="dialog"
      aria-label={t("layers.title")}
      className="absolute inset-y-0 right-0 z-20 flex w-56 max-w-[80%] flex-col border-l border-line bg-surface shadow-2xl"
    >
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
        <PanelButton label={t("layers.close")} onClick={onClose}>
          <CloseIcon className="h-4 w-4" />
        </PanelButton>
      </header>

      {/* Topmost first: the list reads the way the marks stack. */}
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
        {[...layers].reverse().map((layer, fromTop) => {
          const at = layers.length - 1 - fromTop;
          const active = layer.id === activeId;
          const strokes = marks.get(layer.id) ?? [];
          const name = nameOf(layer.name);
          return (
            <li
              key={layer.id}
              className={
                active
                  ? "bg-accent/15 shadow-[inset_3px_0_0_var(--color-accent)]"
                  : ""
              }
            >
              <div className="flex items-center gap-0.5 px-1.5">
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
                <button
                  type="button"
                  onClick={() => store.selectLayer(layer.id)}
                  aria-current={active ? "true" : undefined}
                  title={t("layers.select", { name })}
                  className={`flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1.5 pr-1 text-left ${
                    layer.hidden ? "opacity-40" : ""
                  }`}
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
                <div className="flex items-center justify-end gap-0.5 px-1.5 pb-1">
                  <PanelButton
                    label={t("layers.moveUp", { name })}
                    disabled={at === layers.length - 1}
                    onClick={() => store.moveLayer(layer.id, at + 1)}
                  >
                    <ChevronUpIcon className="h-4 w-4" />
                  </PanelButton>
                  <PanelButton
                    label={t("layers.moveDown", { name })}
                    disabled={at === 0}
                    onClick={() => store.moveLayer(layer.id, at - 1)}
                  >
                    <ChevronDownIcon className="h-4 w-4" />
                  </PanelButton>
                  <PanelButton
                    label={t("layers.delete", { name })}
                    tone="danger"
                    // The last layer stays: a drawing always has somewhere
                    // to draw, and emptying one is what the eraser's clean
                    // sweep is for.
                    disabled={only}
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

      <p className="shrink-0 border-t border-line px-3 py-2 text-[11px] leading-snug text-muted">
        {t("layers.hint")}
      </p>

      {/* Losing a layer loses every mark on it. Undo brings both back, but the
          marks are out of sight in the panel, so the count goes in the prompt —
          "and the 40 marks on it" is the part worth reading. */}
      <ConfirmDialog
        open={doomed !== undefined}
        title={t("layers.delete", { name: doomed ? nameOf(doomed.name) : "" })}
        description={t("layers.deleteConfirm", {
          name: doomed ? nameOf(doomed.name) : "",
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
    </aside>
  );
}
