// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useMemo, useState } from "react";

import {
  Button,
  Checkbox,
  Modal,
  SelectPicker,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import {
  drawingLayers,
  groupByLayer,
  isLocked,
  layerDisplayName,
} from "./layers.ts";
import { LayerThumbnail } from "./LayerThumbnail.tsx";
import { canMergeFrom, canMergeInto, canMergeLayers } from "./merge.ts";
import type { Drawing } from "./types.ts";

// **Merge layers** — which layers become one, and which one they become.
//
// Two questions and no third, because merging is one of the few things in this
// panel you cannot see the result of until it has happened: the marks all end
// up somewhere, and where is the whole decision. So the dialog asks it outright
// with a destination picker rather than inferring it from "the lowest one you
// ticked", which is what a bare "Merge" button on a multi-select would have
// meant without saying so.
//
// The list is the layer panel's list, in the same order (topmost first) and
// with the same previews, so the row you tick here is recognisably the row you
// were looking at there. What can and can't take part is `merge.ts`'s to say —
// a locked layer stays out, the sheet may be merged into but never away — and a
// row that can't is shown *disabled with the reason* rather than left out. A
// layer that silently isn't in the list reads as a bug; a greyed one with
// "locked" under it reads as an instruction.

type Props = {
  drawing: Drawing;
  /** The page's colours, as the canvas resolved them — the previews paint on
   *  the same sheet the drawing does. */
  pageColor: string;
  defaultInk: string;
  onCancel: () => void;
  /** Merge `sources` (the destination among them) into `target`. */
  onMerge: (sources: string[], target: string) => void;
};

export function MergeLayersModal({
  drawing,
  pageColor,
  defaultInk,
  onCancel,
  onMerge,
}: Props) {
  const t = useT();
  const layers = drawingLayers(drawing);
  const marks = useMemo(() => groupByLayer(drawing), [drawing]);

  const nameOf = (layer: { id: string; name: string }) =>
    layerDisplayName(layer, {
      background: t("layers.background"),
      base: t("layers.base"),
    });

  // What the dialog opens on: every layer that can be merged away, which is the
  // common ask ("put this stack together"). The sheet is left unticked even
  // when it could be a destination — merging a drawing onto its page is a
  // bigger thing to mean than merging two of its layers, and it should be
  // asked for rather than arrived at. It is only ticked when nothing else adds
  // up to a merge at all.
  const [picked, setPicked] = useState<string[]>(() => {
    const from = layers.filter((l) => canMergeFrom(drawing, l.id));
    if (from.length >= 2) return from.map((l) => l.id);
    const sheet = layers.find(
      (l) => canMergeInto(drawing, l.id) && !canMergeFrom(drawing, l.id),
    );
    return sheet ? [...from.map((l) => l.id), sheet.id] : from.map((l) => l.id);
  });
  // The destination, when the user has named one. Held as "what was asked for"
  // rather than as the answer, so unticking the chosen row falls back to the
  // default below instead of leaving the dialog pointed at a layer that is no
  // longer taking part.
  const [chosen, setChosen] = useState<string | null>(null);

  // Where the marks land: the layer that was chosen while it is still ticked
  // and still able to take them, and otherwise the lowest ticked one that can —
  // the direction a stack is merged in when nobody says otherwise.
  const destinations = layers.filter(
    (layer) => picked.includes(layer.id) && canMergeInto(drawing, layer.id),
  );
  const target =
    chosen && destinations.some((layer) => layer.id === chosen)
      ? chosen
      : (destinations[0]?.id ?? null);

  const toggle = (id: string, on: boolean) =>
    setPicked((held) =>
      on ? [...held, id] : held.filter((other) => other !== id),
    );

  const ready = target !== null && canMergeLayers(drawing, picked, target);
  const landing = layers.find((layer) => layer.id === target);
  // How much is about to move — the one number worth printing, since the
  // previews say which layers and nothing says how much is on them.
  const moving = picked
    .filter((id) => id !== target)
    .reduce((n, id) => n + (marks.get(id)?.length ?? 0), 0);

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="merge-title"
      centered
      size="max-w-md"
      closeLabel={t("common.cancel")}
      footer={
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!ready}
            onClick={() => {
              if (ready) onMerge(picked, target);
            }}
          >
            {t("layers.mergeApply")}
          </Button>
        </footer>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-5">
        {/* No ellipsis on the heading: the three dots on the button meant "this
            opens something", and this is the something. */}
        <h2 id="merge-title" className="text-base font-bold text-fg-bright">
          {t("layers.mergeTitle")}
        </h2>

        <p className="text-xs text-muted">{t("layers.mergeHint")}</p>

        {/* Topmost first, like the panel. */}
        <ul className="flex flex-col rounded border border-line">
          {[...layers].reverse().map((layer) => {
            const id = layer.id;
            const name = nameOf(layer);
            const strokes = marks.get(id) ?? [];
            const takes = canMergeInto(drawing, id);
            const leaves = canMergeFrom(drawing, id);
            const on = picked.includes(id);
            // Nothing to offer on a row that can be neither merged away nor
            // merged into: a locked layer, or a sheet that is switched off.
            const off = !takes && !leaves;
            const why = isLocked(layer)
              ? t("layers.mergeLocked")
              : off
                ? t("layers.mergeNoSheet")
                : null;
            return (
              <li
                key={id}
                className={`flex items-center gap-2 border-b border-line px-2 py-1.5 last:border-b-0 ${
                  off ? "opacity-50" : ""
                }`}
              >
                <Checkbox
                  checked={on && !off}
                  onChange={(next) => toggle(id, next)}
                  ariaLabel={t("layers.mergeInclude", { name })}
                  className={off ? "pointer-events-none" : "cursor-pointer"}
                />
                <LayerThumbnail
                  drawing={drawing}
                  strokes={strokes}
                  pageColor={pageColor}
                  defaultInk={defaultInk}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg-bright">
                    {name}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {why ??
                      (strokes.length === 0
                        ? t("layers.empty")
                        : t("layers.marks", { n: String(strokes.length) }))}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        {/* The label over the picker rather than beside it, the way the
            settings pages set one out: a layer's name is as long as its owner
            made it, and a row that has to share its width with a heading
            truncates the one thing being chosen. */}
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("layers.mergeInto")}
          </span>
          <SelectPicker<string>
            value={target ?? ""}
            ariaLabel={t("layers.mergeInto")}
            disabled={destinations.length === 0}
            onChange={setChosen}
            options={[...destinations]
              .reverse()
              .map((layer) => ({ value: layer.id, label: nameOf(layer) }))}
          />
        </div>

        {/* What is about to happen, in one line. Merging is undoable and this
            says so — the sentence people look for before they press a button
            that rearranges their drawing. */}
        <p className="text-xs text-muted">
          {ready && landing
            ? t("layers.mergeSummary", {
                n: String(moving),
                name: nameOf(landing),
              })
            : t("layers.mergePickTwo")}
        </p>
      </div>
    </Modal>
  );
}
