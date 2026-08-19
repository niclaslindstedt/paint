// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState, type ReactNode } from "react";

import {
  ConfirmDialog,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";

import {
  MirrorHorizontalIcon,
  MirrorVerticalIcon,
  ResizeIcon,
  TurnLeftIcon,
  TurnRightIcon,
} from "../icons.tsx";
import { useT } from "../i18n/index.ts";
import { isItemOn } from "../panelSections.ts";
import { stackIsReset } from "../layers.ts";
import {
  mirrorDrawing,
  turnDrawing,
  type BitmapTurn,
  type PageEdit,
} from "../transform.ts";
import type { Drawing } from "../types.ts";
import type { PaintStore } from "../usePaintStore.ts";
import { PanelButton, SectionHeading } from "./shared.tsx";
import type { SectionProps } from "./section.ts";

// **Image** — what you can do to the *page* rather than to a mark: resize it,
// turn it, mirror it, or throw the whole drawing away.
//
// They are rows of paired buttons rather than a menu: each pair is one decision
// (which way?), and both halves are one tap.
//
// The bin is at the far end of the section's own heading rather than in the run
// of buttons below, and that is not decoration. Throwing a drawing away is an
// action on the *document* — every mark, every layer, and the page colour with
// them — so it belongs beside resize and flip; and something you can hit by
// accident on the way to "flip" is not where the irreversible thing goes.

export function PageSection({
  section,
  store,
  drawing,
  open,
  onToggle,
  hiddenItems,
  drag,
  dragging,
  onResize,
  onTransform,
}: SectionProps & {
  store: PaintStore;
  drawing: Drawing;
  onResize: () => void;
  onTransform: (
    edit: (drawing: Drawing, bitmap: BitmapTurn) => PageEdit,
  ) => void;
}) {
  const t = useT();
  const [confirmReset, setConfirmReset] = useState(false);
  const on = (id: string) => isItemOn(hiddenItems, id);

  // Nothing to throw away: no marks, and no stack beyond the one starting over
  // would leave. The page's colour and sheet survive a reset — they are what
  // the page is, not what is on it — so neither lights the bin.
  const untouched = drawing.strokes.length === 0 && stackIsReset(drawing);

  return (
    <>
      <SectionHeading
        title={t(section.titleKey)}
        open={open}
        onToggle={onToggle}
        drag={drag}
        dragging={dragging}
      >
        {/* Start over: every mark and every layer, gone in one undoable step —
            the page keeps its colour and its sheet. Dim on a drawing that is
            already blank, so the bin can't offer to throw away nothing. */}
        {on("page:reset") && (
          <PanelButton
            label={t("page.reset")}
            tone="danger"
            disabled={untouched}
            onClick={() => setConfirmReset(true)}
          >
            <TrashIcon className="h-4 w-4" />
          </PanelButton>
        )}
      </SectionHeading>

      {open && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {on("page:resize") && (
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
          )}

          {on("page:flip") && (
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
          )}

          {on("page:mirror") && (
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
          )}
        </div>
      )}

      {/* Starting over takes more than a delete does — every layer as well as
          every mark — so the prompt says so rather than asking "are you
          sure?". */}
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
    </>
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
