// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ConfirmDialog,
  ImageUpIcon,
  StarIcon,
} from "@niclaslindstedt/oss-framework/components";
import {
  dragHasFilesOfType,
  firstFileOfType,
  useFileDrop,
} from "@niclaslindstedt/oss-framework/hooks";

import { defaultInk, resolvePageColor } from "./canvas.ts";
import { DownloadMenu } from "./DownloadMenu.tsx";
import { DrawingTitle } from "./DrawingTitle.tsx";
import type { MenuEdge } from "./gestures.ts";
import { HeaderIconButton } from "./HeaderIconButton.tsx";
import { LayersIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { ImagePlacement } from "./ImagePlacement.tsx";
import { importImageFile } from "./images.ts";
import { LayersPanel } from "./LayersPanel.tsx";
import { PaintCanvas } from "./PaintCanvas.tsx";
import { initialPlacement, type Placement } from "./placement.ts";
import { imageStroke } from "./plugins/builtin/image.ts";
import { resolveDials, tunedDials } from "./plugins/dials.ts";
import { pluginById } from "./plugins/registry.ts";
import { Toolbar } from "./Toolbar.tsx";
import { ToolFlash } from "./ToolFlash.tsx";
import type { AppSettings } from "./useAppSettings.ts";
import type { PaintStore } from "./usePaintStore.ts";
import { toDocumentPoint, type CanvasView } from "./viewport.ts";
import * as output from "../output.ts";

// The main screen: a header naming the open drawing (with the favourite star
// and the download menu), the page itself, and the toolbar under it.
//
// Clearing the page is the screen's too, but it has no button up here: the
// toolbar offers it from the erasing tool (see `Toolbar.tsx`) and calls back,
// and the screen asks for confirmation and files the edit.
//
// The sync glyph is deliberately *not* here: there is one cloud affordance for
// the whole app and it lives in the side menu's button island, so the header
// keeps its width for the controls that act on the drawing in front of you.
//
// The screen owns no drawing state — the store owns the document, the settings
// own the ink, and `PaintCanvas` owns the gesture in flight. This component is
// the wiring between them, plus the one piece of state that is neither document
// nor gesture: an image that has been dropped but not yet settled.

/** The ways the toolbar's pickers write back to the user's own kit — the
 *  colours they mixed, the nib widths they added, and how they have their tools
 *  tuned. Bundled rather than passed one by one because they travel together
 *  and always will. */
export type PaletteActions = {
  addColor: (color: string) => void;
  removeColor: (color: string) => void;
  addSize: (size: number) => void;
  removeSize: (size: number) => void;
  /** Move one of a tool's dials, or forget it with `null` (see
   *  `plugins/dials.ts`). */
  setDial: (tool: string, dial: string, value: number | null) => void;
  /** Put every dial on one tool back where it started. */
  resetDials: (tool: string) => void;
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
  // The layers panel, floating over the right edge of the page. Screen state
  // too: which panels are open is not part of the drawing.
  const [layersOpen, setLayersOpen] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drawing = store.activeDrawing;

  // A placement belongs to the page it was dropped on. Opening another drawing
  // with one still floating drops it rather than carrying it across — settling
  // it there would file the picture onto a page it was never dropped on.
  const openPage = drawing?.id;
  useEffect(() => setPlacement(null), [openPage]);
  // The panel is about the page it was opened over, so it closes with it.
  useEffect(() => setLayersOpen(false), [openPage]);

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

  // How the tool in hand is tuned. Two reads of the same thing: the panel wants
  // every dial the tool offers so it has a slider per one, and the canvas wants
  // only the dials actually moved, because that is what a stroke records (see
  // `plugins/dials.ts`).
  const activePlugin = pluginById(tool);
  const tuning = settings.toolDials[tool];
  const dialValues = resolveDials(activePlugin, tuning);
  const inkDials = tunedDials(activePlugin, tuning);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* The header pads by the top safe-area inset so its title and buttons
          sit clear of the status bar / Dynamic Island in the installed iOS PWA,
          which paints edge to edge (`viewport-fit=cover`). */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))]">
        {/* The name is edited in place — a drawing is named by typing over its
            title, not through a dialog. It reads as the page's heading until
            it is pressed (see `DrawingTitle`). */}
        <DrawingTitle
          value={drawing.name}
          onCommit={(next) => store.renameActive(next)}
        />

        <div className="flex items-center gap-2">
          {/* The star — where favouriting is discovered, and what puts the
              drawing in the side menu's Favorites section. */}
          <HeaderIconButton
            label={drawing.favorite ? t("menu.unfavorite") : t("menu.favorite")}
            pressed={Boolean(drawing.favorite)}
            onClick={() => store.toggleFavorite(drawing.id)}
          >
            <StarIcon className="h-[18px] w-[18px]" filled={drawing.favorite} />
          </HeaderIconButton>
          {/* The layers panel's other door. The swipe from the right edge is
              the phone gesture; this button is how it is *found*, and the only
              way in on a desktop where no thumb is near an edge. */}
          <HeaderIconButton
            label={t("layers.open")}
            pressed={layersOpen}
            onClick={() => setLayersOpen((open) => !open)}
          >
            <LayersIcon className="h-[18px] w-[18px]" />
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
          {/* No bin either. Wiping the page is erasing at its largest scale, so
              it lives where erasing does — press the eraser a second time and
              the toolbar offers both (see `Toolbar.tsx`). The header keeps the
              width for the title, and the destructive action moves out of
              thumb's reach of the star and the download menu. */}
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
            dials: inkDials,
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
          // The layers panel's edge — unless the sidebar is already watching
          // that side, in which case its swipe owns it and the header button is
          // the way in. Nothing is armed while the panel is open: the scrim
          // below has the canvas then.
          panelSwipeEdge={
            layersOpen || menuSwipeEdge === "right" ? null : "right"
          }
          onPanelSwipe={() => setLayersOpen(true)}
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

        {/* The layers panel, and the sheet of nothing that closes it. A press
            on the page dismisses the panel rather than drawing — the same
            "click outside it" rule a floating menu follows — while the header
            and the toolbar stay live, so picking a colour for the layer you
            just selected doesn't cost you the panel. */}
        {layersOpen && (
          <>
            <div
              className="absolute inset-0 z-10"
              onPointerDown={() => setLayersOpen(false)}
              aria-hidden="true"
            />
            <LayersPanel
              store={store}
              drawing={drawing}
              pageColor={pageColor}
              defaultInk={ink}
              onClose={() => setLayersOpen(false)}
            />
          </>
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

        {/* The name of the tool you just picked, over the middle of the page —
            the toolbar's glyphs have no room for words, and this is where you
            are already looking. Above the layers panel on purpose: switching
            tools with the panel open still says what you switched to. */}
        <ToolFlash tool={tool} enabled={settings.showToolName} />

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
        dialValues={dialValues}
        onDialChange={(dial, value) => palette.setDial(tool, dial, value)}
        onResetDials={() => palette.resetDials(tool)}
        dialsTuned={Object.keys(inkDials).length > 0}
        filled={settings.filled}
        onFilledChange={(filled) => update("filled", filled)}
        // Clearing is an edit on the document, not a tool: the toolbar offers
        // it from the erasing tool's button, and the screen keeps the question
        // and the edit.
        onClearPage={() => setConfirmClear(true)}
        pageHasMarks={drawing.strokes.length > 0}
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
