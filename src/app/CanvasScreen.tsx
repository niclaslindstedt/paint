// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ConfirmDialog,
  ImageUpIcon,
  InlineEditField,
  StarIcon,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";
import {
  dragHasFilesOfType,
  firstFileOfType,
  useFileDrop,
} from "@niclaslindstedt/oss-framework/hooks";

import { defaultInk, resolvePageColor } from "./canvas.ts";
import { DownloadMenu } from "./DownloadMenu.tsx";
import type { MenuEdge } from "./gestures.ts";
import { HeaderIconButton } from "./HeaderIconButton.tsx";
import { useT } from "./i18n/index.ts";
import { ImagePlacement } from "./ImagePlacement.tsx";
import { importImageFile } from "./images.ts";
import { PaintCanvas } from "./PaintCanvas.tsx";
import { initialPlacement, type Placement } from "./placement.ts";
import { imageStroke } from "./plugins/builtin/image.ts";
import { Toolbar } from "./Toolbar.tsx";
import type { AppSettings } from "./useAppSettings.ts";
import type { PaintStore } from "./usePaintStore.ts";
import { toDocumentPoint, type CanvasView } from "./viewport.ts";
import * as output from "../output.ts";

// The main screen: a header naming the open drawing (with the favourite star
// and the download/clear actions), the page itself, and the toolbar under it.
//
// The sync glyph is deliberately *not* here: there is one cloud affordance for
// the whole app and it lives in the side menu's button island, so the header
// keeps its width for the controls that act on the drawing in front of you.
//
// The screen owns no drawing state — the store owns the document, the settings
// own the ink, and `PaintCanvas` owns the gesture in flight. This component is
// the wiring between them, plus the one piece of state that is neither document
// nor gesture: an image that has been dropped but not yet settled.

/** The four ways the toolbar's pickers write back to the user's own palette —
 *  the colours they mixed and the nib widths they added. Bundled rather than
 *  passed one by one because they travel together and always will. */
export type PaletteActions = {
  addColor: (color: string) => void;
  removeColor: (color: string) => void;
  addSize: (size: number) => void;
  removeSize: (size: number) => void;
};

type Props = {
  store: PaintStore;
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  /** Writes into the kept colours and sizes (see `PaletteActions`). */
  palette: PaletteActions;
  /** The active tool, already resolved against what the toolbar offers. */
  tool: string;
  /** Whether the page is a dark sheet — resolved from the canvas theme and the
   *  app appearance by `App`, so the screen never re-derives it. */
  darkCanvas: boolean;
  /** The screen edge the sidebar's open-swipe is armed on, if any. Passed
   *  through to the canvas, which must not draw that swipe. */
  menuSwipeEdge?: MenuEdge | null;
};

export function CanvasScreen({
  store,
  settings,
  update,
  palette,
  tool,
  darkCanvas,
  menuSwipeEdge = null,
}: Props) {
  const t = useT();
  const [confirmClear, setConfirmClear] = useState(false);
  // Bumped to ask the canvas to re-fit its view; the live zoom comes back the
  // other way so the header's button can read out the current scale. The view
  // itself stays inside `PaintCanvas` — it is screen state, not document state,
  // and nothing above here has any business knowing where you scrolled to. The
  // one exception is the placement frame below, which has to sit exactly over
  // the page and so is told the view as it changes.
  const [fitToken, setFitToken] = useState(0);
  const [scale, setScale] = useState(1);
  const [view, setView] = useState<CanvasView | null>(null);
  // A dropped image, floating over the page until it is settled. Screen state
  // on purpose: nothing is in the document — and nothing is undoable — until
  // the placement is kept.
  const [placement, setPlacement] = useState<Placement | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drawing = store.activeDrawing;

  // A placement belongs to the page it was dropped on. Opening another drawing
  // with one still floating drops it rather than carrying it across — settling
  // it there would file the picture onto a page it was never dropped on.
  const openPage = drawing?.id;
  useEffect(() => setPlacement(null), [openPage]);

  /** Keep the floating image: file it as one mark on the page. */
  const settle = useCallback(() => {
    setPlacement((current) => {
      if (!current) return null;
      store.addStroke(
        imageStroke(current.src, current.box),
        // Grow the sheet around a picture that was dropped (or dragged) past
        // its edge — the page follows the picture, not the other way round.
        { fitPage: true },
      );
      return null;
    });
  }, [store]);

  // Dropping an image file anywhere on the canvas places it. The whole surface
  // is the target rather than a dropzone you have to find, and the drag is
  // claimed for image files only, so anything else a browser might drop stays
  // free to fall through.
  const { active: dragging } = useFileDrop({
    targetRef: surfaceRef,
    accepts: (dt) => dragHasFilesOfType(dt, "image/"),
    claim: true,
    onDrop: (files) => {
      const file = firstFileOfType(files, "image/");
      if (!file || !drawing) return;
      void importImageFile(file)
        .then((image) => {
          // Land it where you were looking: the middle of the window, in
          // document coordinates. A picture bigger than the sheet lands at the
          // origin instead and takes the page over (see `initialPlacement`).
          const center =
            view && surfaceRef.current
              ? toDocumentPoint(view, {
                  x: surfaceRef.current.clientWidth / 2,
                  y: surfaceRef.current.clientHeight / 2,
                })
              : null;
          setPlacement(initialPlacement(image, drawing, center));
        })
        .catch((err: unknown) =>
          output.error(
            `Couldn't add that image — ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    },
  });

  if (!drawing) return null;

  // The page this drawing actually paints on, and the ink an unpicked mark
  // resolves to on it: the drawing's pinned colour when it has one, otherwise
  // the canvas theme's. Both travel to the renderer and to every image export,
  // so screen and file agree.
  const pageColor = resolvePageColor(drawing.background, darkCanvas);
  const ink = defaultInk(darkCanvas);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The header pads by the top safe-area inset so its title and buttons
          sit clear of the status bar / Dynamic Island in the installed iOS PWA,
          which paints edge to edge (`viewport-fit=cover`). */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
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

        <div className="flex items-center gap-1">
          {/* The star — where favouriting is discovered, and what puts the
              drawing in the side menu's Favorites section. */}
          <HeaderIconButton
            label={drawing.favorite ? t("menu.unfavorite") : t("menu.favorite")}
            pressed={Boolean(drawing.favorite)}
            onClick={() => store.toggleFavorite(drawing.id)}
          >
            <StarIcon
              className={`h-[18px] w-[18px] ${drawing.favorite ? "text-accent" : ""}`}
              filled={drawing.favorite}
            />
          </HeaderIconButton>
          {/* No undo / redo here. They are one tap away in the sidebar's
              button island and on the keyboard, and the header is the one row
              a phone has to fit a drawing's name into — two glyphs it can
              spend elsewhere buy back the width to read the title. */}
          <DownloadMenu
            drawing={drawing}
            formats={settings.downloadFormats}
            options={{
              pageColor,
              defaultInk: ink,
              scope: settings.downloadScope,
              transparent: settings.downloadTransparent,
            }}
          />
          <HeaderIconButton
            label={t("canvas.clear")}
            disabled={drawing.strokes.length === 0}
            onClick={() => setConfirmClear(true)}
          >
            <TrashIcon className="h-[18px] w-[18px]" />
          </HeaderIconButton>
        </div>
      </header>

      {/* The window onto the page. The canvas fills it edge to edge — the page
          inside is larger than the screen, and you pan and pinch around it — so
          `min-h-0` matters: it lets the flex child actually shrink to the space
          left over rather than pushing the toolbar off the bottom. */}
      <div
        ref={surfaceRef}
        className="relative min-h-0 flex-1 overflow-hidden bg-page-bg"
      >
        <PaintCanvas
          drawing={drawing}
          pageColor={pageColor}
          tool={tool}
          ink={{
            color: settings.color,
            size: settings.size,
            hardness: settings.hardness,
            filled: settings.filled,
          }}
          defaultInk={ink}
          showGrid={settings.showGrid}
          fitToken={fitToken}
          onScaleChange={setScale}
          onViewChange={setView}
          placing={placement !== null}
          onPlacingPress={settle}
          menuSwipeEdge={menuSwipeEdge}
          onCommit={store.addStroke}
          // The dropper's press: the colour it sampled becomes the ink, pinned
          // the same way picking a swatch pins one.
          onPickColor={(picked) => update("color", picked)}
          ariaLabel={drawing.name.trim() || t("menu.untitled")}
        />

        {/* The dropped image, floating over the page until it is kept. */}
        {placement && view && (
          <ImagePlacement
            view={view}
            placement={placement}
            onChange={setPlacement}
            onSettle={settle}
            onCancel={() => setPlacement(null)}
          />
        )}

        {/* The cue while an image is dragged over the canvas: the surface says
            it will take it, so the drop isn't a guess. */}
        {dragging && (
          <div className="pointer-events-none absolute inset-3 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-accent/10">
            <span className="flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-sm text-fg-bright">
              <ImageUpIcon className="h-4 w-4 text-accent" />
              {t("canvas.dropImage")}
            </span>
          </div>
        )}

        {/* The zoom readout, floating over the canvas rather than sitting in
            the header — six icon buttons up there left a phone's title field
            too narrow to read. It doubles as the way back: tap to fit the whole
            page, tap again for 1:1. Hidden from the pointer stream everywhere
            but on itself, so it can never swallow a stroke that runs under it. */}
        <button
          type="button"
          onClick={() => setFitToken((n) => n + 1)}
          aria-label={t("canvas.fitPage")}
          title={t("canvas.fitPage")}
          className="absolute right-3 bottom-3 cursor-pointer rounded-full border border-line bg-surface/90 px-2.5 py-1 text-xs text-muted tabular-nums hover:text-fg-bright"
        >
          {t("canvas.zoomPercent", {
            percent: String(Math.round(scale * 100)),
          })}
        </button>
      </div>

      {/* No empty-state hint. A blank sheet with a toolbar under it already
          says "draw here", and a paragraph of instructions between the page and
          the tools was two lines of reading in the way of the first mark — on a
          phone it pushed the toolbar down as well. The gestures are in the docs
          and, for panning, in the hand tool that is now in the toolbar. */}

      <Toolbar
        tool={tool}
        onToolChange={(id) => update("activeTool", id)}
        enabled={settings.enabledPlugins}
        // The toolbar shows the *resolved* ink as selected, so the swatch row
        // reflects what the next mark will actually be even before one is
        // picked; picking one pins it (see `canvas.ts`).
        color={settings.color ?? ink}
        onColorChange={(color) => update("color", color)}
        // The eraser's colour, shown as the other half of the ink button and
        // offered as a swatch of its own in the picker.
        background={pageColor}
        customColors={settings.customColors}
        onAddColor={palette.addColor}
        onRemoveColor={palette.removeColor}
        size={settings.size}
        onSizeChange={(size) => update("size", size)}
        customSizes={settings.customSizes}
        onAddSize={palette.addSize}
        onRemoveSize={palette.removeSize}
        hardness={settings.hardness}
        onHardnessChange={(hardness) => update("hardness", hardness)}
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
