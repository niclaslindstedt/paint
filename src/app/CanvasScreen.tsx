// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";

import {
  ConfirmDialog,
  DownloadIcon,
  InlineEditField,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from "@niclaslindstedt/oss-framework/components";
import { downloadBlob } from "@niclaslindstedt/oss-framework/files";
import { SyncStatus } from "@niclaslindstedt/oss-framework/sync";

import { defaultInk, resolvePageColor } from "./canvas.ts";
import { drawingToPng, exportFileName } from "./export.ts";
import { useT } from "./i18n/index.ts";
import { log } from "./log.ts";
import { PaintCanvas } from "./PaintCanvas.tsx";
import { Toolbar } from "./Toolbar.tsx";
import type { AppSettings } from "./useAppSettings.ts";
import type { PaintStore } from "./usePaintStore.ts";
import type { SyncEngine } from "./useSyncEngine.ts";
import * as output from "../output.ts";

// The main screen: a header naming the open drawing (with the framework's sync
// glyph and the undo/redo/export/clear actions), the page itself, and the
// toolbar under it.
//
// The screen owns no drawing state — the store owns the document, the settings
// own the ink, and `PaintCanvas` owns the gesture in flight. This component is
// the wiring between them.

type Props = {
  store: PaintStore;
  sync: SyncEngine;
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** The active tool, already resolved against what the toolbar offers. */
  tool: string;
  /** Whether the page is a dark sheet — resolved from the canvas theme and the
   *  app appearance by `App`, so the screen never re-derives it. */
  darkCanvas: boolean;
  onOpenSyncDetails: () => void;
};

export function CanvasScreen({
  store,
  sync,
  settings,
  update,
  tool,
  darkCanvas,
  onOpenSyncDetails,
}: Props) {
  const t = useT();
  const [confirmClear, setConfirmClear] = useState(false);
  const drawing = store.activeDrawing;

  if (!drawing) return null;

  // The page this drawing actually paints on, and the ink an unpicked mark
  // resolves to on it: the drawing's pinned colour when it has one, otherwise
  // the canvas theme's. Both travel to the renderer and the PNG export, so
  // screen and file agree.
  const pageColor = resolvePageColor(drawing.background, darkCanvas);
  const ink = defaultInk(darkCanvas);

  const exportPng = async () => {
    try {
      const blob = await drawingToPng(drawing, { pageColor, defaultInk: ink });
      downloadBlob(exportFileName(drawing, "png"), blob);
      log.info(`export: wrote ${exportFileName(drawing, "png")}`);
    } catch (err) {
      output.error(
        `Couldn't export the PNG — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
        {/* The name is edited in place — a drawing is named by typing over its
            title, not through a dialog. */}
        <div className="min-w-0 flex-1">
          <InlineEditField
            initial={drawing.name}
            placeholder={t("menu.untitled")}
            ariaLabel={t("menu.drawingName")}
            onCommit={(next) => store.renameActive(next)}
            onCancel={() => {}}
            className="w-full"
          />
        </div>

        <SyncStatus
          providerName={sync.providerName}
          status={sync.status}
          dirty={sync.dirty}
          offline={sync.offline}
          onOpenDetails={onOpenSyncDetails}
          labels={{ syncedTo: (name) => t("sync.syncedTo", { name }) }}
        />

        <div className="flex items-center gap-1">
          <IconButton
            label={t("canvas.undo")}
            disabled={!store.canUndo}
            onClick={store.undo}
          >
            <UndoIcon className="h-[18px] w-[18px]" />
          </IconButton>
          <IconButton
            label={t("canvas.redo")}
            disabled={!store.canRedo}
            onClick={store.redo}
          >
            <RedoIcon className="h-[18px] w-[18px]" />
          </IconButton>
          <IconButton label={t("canvas.exportPng")} onClick={exportPng}>
            <DownloadIcon className="h-[18px] w-[18px]" />
          </IconButton>
          <IconButton
            label={t("canvas.clear")}
            disabled={drawing.strokes.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            <TrashIcon className="h-[18px] w-[18px]" />
          </IconButton>
        </div>
      </header>

      {/* The page. `min-h-0` lets the flex child actually shrink, so the canvas
          scales to the space left over rather than pushing the toolbar off. */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-page-bg p-3">
        <PaintCanvas
          drawing={drawing}
          pageColor={pageColor}
          tool={tool}
          ink={{
            color: settings.color,
            size: settings.size,
            filled: settings.filled,
          }}
          defaultInk={ink}
          showGrid={settings.showGrid}
          onCommit={store.addStroke}
          ariaLabel={drawing.name.trim() || t("menu.untitled")}
        />
      </div>

      {drawing.strokes.length === 0 && (
        <p className="shrink-0 px-3 pb-1 text-center text-xs text-muted">
          {t("canvas.emptyHint")}
        </p>
      )}

      <Toolbar
        tool={tool}
        onToolChange={(id) => update("activeTool", id)}
        enabled={settings.enabledPlugins}
        // The toolbar shows the *resolved* ink as selected, so the swatch row
        // reflects what the next mark will actually be even before one is
        // picked; picking one pins it (see `canvas.ts`).
        color={settings.color ?? ink}
        onColorChange={(color) => update("color", color)}
        size={settings.size}
        onSizeChange={(size) => update("size", size)}
        filled={settings.filled}
        onFilledChange={(filled) => update("filled", filled)}
      />

      <ConfirmDialog
        open={confirmClear}
        title={t("canvas.clear")}
        description={t("canvas.clearConfirm")}
        confirmLabel={t("common.clear")}
        tone="danger"
        onConfirm={() => {
          store.clearActive();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

/** A square icon button in the header row — the same affordance repeated four
 *  times, so it is one component rather than four copies of the class list. */
function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
