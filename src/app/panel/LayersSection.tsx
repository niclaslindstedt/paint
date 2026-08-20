// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  ConfirmDialog,
  PlusIcon,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";

import { EyeIcon, EyeOffIcon, LockIcon, UnlockIcon } from "../icons.tsx";
import { useT } from "../i18n/index.ts";
import {
  canDeleteLayer,
  canMoveLayerTo,
  drawingLayers,
  groupByLayer,
  isLocked,
  layerDisplayName,
  nextLayerName,
} from "../layers.ts";
import { LayerThumbnail } from "../LayerThumbnail.tsx";
import { isItemOn } from "../panelSections.ts";
import type { Drawing } from "../types.ts";
import type { PaintStore } from "../usePaintStore.ts";
import { PanelButton, SectionHeading } from "./shared.tsx";
import type { SectionProps } from "./section.ts";

// **Layers** — the stack, topmost first, the way every drawing app has shown a
// stack since the idea existed.
//
// Actions hang off the *selected* row rather than every row. A layer stack is a
// list you pick from far more often than you reorder, and four glyphs on every
// row of a 224-pixel panel is a row you can't read and can't hit. Picking a
// layer is one tap; what you can then do to it is right under your thumb.
//
// The two exceptions are the eye and the padlock, which sit on every row. Both
// are switches rather than actions — you read them as much as you press them —
// and the padlock has to be reachable on a row that *cannot be selected*, which
// is the whole point of a lock: the sheet at the bottom of a fresh drawing is
// locked, and the only way back to it is the glyph on its own row. That is also
// why switching either of them off in Settings → Panel is a real choice with a
// real cost, and the setting says so: a layer already hidden or already locked
// stays that way, because the control that would undo it is the one you took
// out of the panel.
//
// Each row carries a **preview of its marks** (`LayerThumbnail`) rather than a
// count of them. The count answered the wrong question — you open this panel to
// find which layer holds the labels, not how many strokes are in it — so the
// number survives only where it is genuinely the point: the prompt that warns
// you how much a delete is about to take. It is still read out to a screen
// reader, which the picture is no use to.

export function LayersSection({
  section,
  store,
  drawing,
  pageColor,
  defaultInk,
  docked,
  open,
  onToggle,
  hiddenItems,
  drag,
  dragging,
}: SectionProps & {
  store: PaintStore;
  drawing: Drawing;
  pageColor: string;
  defaultInk: string;
  docked: boolean;
}) {
  const t = useT();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const on = (id: string) => isItemOn(hiddenItems, id);

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

  return (
    <>
      <SectionHeading
        title={t(section.titleKey)}
        open={open}
        onToggle={onToggle}
        drag={drag}
        dragging={dragging}
        // The line under the heading separates it from the list; a folded
        // section has no list, and its wrapper draws the one below it.
        className={open ? "border-b border-line" : ""}
      >
        {on("layers:add") && (
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
        )}
      </SectionHeading>

      {/* Topmost first: the list reads the way the marks stack. */}
      {open && (
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
                  {on("layers:visibility") && (
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
                  )}
                  {/* The padlock. On every row, and on a locked row it is the
                    only live control there is — the row itself refuses the
                    press that would select it. */}
                  {on("layers:lock") && (
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
                  )}
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
                    className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pr-1 pl-1 text-left ${
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
                {active && (on("layers:reorder") || on("layers:delete")) && (
                  <div className="flex items-center justify-end gap-0.5 px-1.5 pb-1">
                    {/* Where a layer may go is `layers.ts`'s to say, and it says
                      two things: not off the ends of the stack, and never
                      under the sheet — which is also why the sheet's own row
                      offers no arrows at all. */}
                    {on("layers:reorder") && (
                      <>
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
                      </>
                    )}
                    {on("layers:delete") && (
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
                    )}
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
      {open && (
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
    </>
  );
}
