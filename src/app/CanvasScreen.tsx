// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Suspense, lazy } from "react";

import {
  ContextMenu,
  CopyIcon,
  ImageUpIcon,
  MenuIcon,
  StarIcon,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";
import {
  dragHasFilesOfType,
  firstFileOfType,
  useFileDrop,
} from "@niclaslindstedt/oss-framework/hooks";

import { defaultInk, resolvePageColor } from "./canvas.ts";
import {
  readPaste,
  readSystemClipboard,
  writeStrokes,
  type PastePayload,
} from "./clipboard.ts";
import { DownloadMenu } from "./DownloadMenu.tsx";
import {
  filterDescriptor,
  filterOf,
  layerFilterOf,
  type FilterTarget,
} from "./filters.ts";
import { DrawingTitle } from "./DrawingTitle.tsx";
import type { MenuEdge } from "./gestures.ts";
import { HeaderIconButton } from "./HeaderIconButton.tsx";
import { PasteIcon, ScissorsIcon, SidePanelIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { ImagePlacement } from "./ImagePlacement.tsx";
import { importImageFile, type ImportedImage } from "./images.ts";
import { fieldHasKeyboard } from "./keys.ts";
import { SaveButton, type LayerSaveControl } from "./SaveButton.tsx";
import { SidePanel } from "./SidePanel.tsx";
import { PaintCanvas } from "./PaintCanvas.tsx";
import { initialPlacement, type Placement } from "./placement.ts";
import { imageStroke } from "./plugins/builtin/image.ts";
import { textStroke, TEXT_TOOL_ID } from "./plugins/builtin/text.ts";
import { resolveDials, tunedDials } from "./plugins/dials.ts";
import {
  hasPicked,
  pickedSwatches,
  resolveSwatches,
} from "./plugins/swatches.ts";
import { groupOf, pluginById } from "./plugins/registry.ts";
import type { DraftStroke } from "./plugins/types.ts";
import {
  offsetTo,
  selectionBox,
  strokesInBox,
  strokesInRegion,
  translateStrokes,
} from "./selection.ts";
import { encodeStrokes } from "./strokeClipboard.ts";
import { TextEntry } from "./TextEntry.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { ToolFlash } from "./ToolFlash.tsx";
import { presetsFor, toolSize, type AppSettings } from "./useAppSettings.ts";
import type { PresetSettings } from "./presets.ts";
import type { Point } from "./types.ts";
import type { PaintStore } from "./usePaintStore.ts";
import {
  resizeCanvas,
  scaleDrawing,
  type ResizeAnchor,
  type Sampling,
} from "./transform.ts";
import { toDocumentPoint, type CanvasView } from "./viewport.ts";
import * as output from "../output.ts";

// The resize dialog is a click away, never a first paint away — like every
// other dialog in the app it loads when it is asked for.
const ResizeModal = lazy(() =>
  import("./ResizeModal.tsx").then((m) => ({ default: m.ResizeModal })),
);

// …and the same for a filter's options, which most drawings never open at all.
const FilterModal = lazy(() =>
  import("./FilterModal.tsx").then((m) => ({ default: m.FilterModal })),
);

// The main screen: a header naming the open drawing (with the favourite star
// and the download menu), the page itself, and the toolbar under it.
//
// The sync glyph is deliberately *not* here: there is one cloud affordance for
// the whole app and it lives in the side menu's button island, so the header
// keeps its width for the controls that act on the drawing in front of you.
//
// The screen owns no drawing state — the store owns the document, the settings
// own the ink, and `PaintCanvas` owns the gesture in flight. This component is
// the wiring between them, plus the pieces of state that are neither document
// nor gesture: an image that has been dropped but not yet settled, a caption
// being typed, and **which marks are selected**.
//
// The selection is held as a set of stroke ids and nothing else. Everything a
// screen wants to know about it — the box it covers, whether a press landed on
// it — is worked out from the document on every render (see `selection.ts`), so
// it can never say something the document doesn't. Undo a move and the outline
// follows; delete the marks and the selection empties itself.
//
// What you can do with a selection is the ordinary set, reachable the ordinary
// three ways: ⌘/Ctrl+C, X and Delete from the keyboard, a right-click on a
// desktop, and a long press on touch. And its other half — ⌘/Ctrl+V — is what
// brings things *in*: marks copied from this app or another tab, a picture (the
// same placement frame a drop opens), or words, which land in the caption box so
// the face and the size are yours to change before they become a mark.

/** The ways the toolbar's pickers write back to the user's own kit — the
 *  colours they mixed, the nib widths they added, and how they have their tools
 *  tuned. Bundled rather than passed one by one because they travel together
 *  and always will. */
export type PaletteActions = {
  addColor: (color: string) => void;
  removeColor: (color: string) => void;
  /** Set the width of one tool — the widths are per tool (see `toolSize`). */
  setSize: (tool: string, size: number) => void;
  /** Save the tool as it is set right now under a name and a mark, put a saved
   *  one back in your hand, or forget one (see `presets.ts`). */
  savePreset: (
    tool: string,
    name: string,
    size: number,
    dials: Readonly<Record<string, number>>,
    glyph: string | null,
  ) => void;
  /** Either kind — one the user saved, or one the tool ships with (see
   *  `PresetSettings`). */
  applyPreset: (tool: string, preset: PresetSettings) => void;
  deletePreset: (tool: string, id: string) => void;
  /** Move one of a tool's dials, or forget it with `null` (see
   *  `plugins/dials.ts`). */
  setDial: (tool: string, dial: string, value: number | null) => void;
  /** Re-colour one of a tool's own inks, or forget it with `null` (see
   *  `plugins/swatches.ts`). */
  setColor: (tool: string, swatch: string, color: string | null) => void;
  /** Put every dial *and* every ink on one tool back where it started. */
  resetDials: (tool: string) => void;
};

/** How far a paste that names no place of its own is nudged from where it was
 *  copied, in document pixels. Enough to see that something landed, close enough
 *  that it is obviously the same thing. */
const PASTE_NUDGE = 16;

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
  /** Show or hide the drawings menu — the header's hamburger. It sits here, at
   *  the head of the drawing, rather than floating over the canvas: the one
   *  button that says "the list of drawings" belongs beside the name of the one
   *  you have open. */
  onToggleMenu: () => void;
  /** Whether that menu is showing, so the button can read as pressed. */
  menuOpen: boolean;
  /** Whether the right-hand panel is docked beside the canvas (a wide screen)
   *  rather than floating over it. Resolved by `App`, which owns the media
   *  query, so the screen and the canvas can't disagree about it. */
  dockPanel: boolean;
  /** Filing the drawing's rendered layers out to the backend — the header's
   *  disk button (see `layerStore.ts`). Absent on a backend that can't take
   *  them, which is what hides the button rather than dimming it.
   *
   *  The screen owns this rather than `App` because a layer's pixels depend on
   *  the canvas theme, and this is where the page colour and the default ink
   *  are resolved. */
  layerSave?: LayerSaveControl | null;
};

export function CanvasScreen({
  store,
  settings,
  update,
  palette,
  tool,
  darkCanvas,
  menuSwipeEdge = null,
  onToggleMenu,
  menuOpen,
  dockPanel,
  layerSave = null,
}: Props) {
  const t = useT();
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
  // A caption being typed: where its caret is, and the words so far. Screen
  // state for exactly the same reason — a half-typed word is not a mark, and
  // nothing reaches the document (or the undo history) until the typing is
  // finished (see `TextEntry.tsx`).
  const [typing, setTyping] = useState<{ at: Point; text: string } | null>(
    null,
  );
  // The right-hand panel, floating over the right edge of the page — on a
  // screen too narrow to dock it. Screen state too: which panels are open is
  // not part of the drawing.
  const [layersOpen, setLayersOpen] = useState(false);
  // The marks a marquee has picked out — ids only, so the selection can never
  // hold a stale copy of a mark the document has since changed.
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  // Where the selection's menu is, in viewport coordinates, or `null` for
  // closed.
  const [menuAt, setMenuAt] = useState<Point | null>(null);
  // The marks this app last copied. The system clipboard is the real one — an
  // in-app copy writes there too, which is what makes copy-here-paste-there
  // work — but a browser may refuse to hand it back, and falling back on what we
  // know we copied beats a paste that does nothing.
  const copied = useRef<DraftStroke[] | null>(null);
  // The resize dialog, which is the one page action that has a question to ask.
  const [resizing, setResizing] = useState(false);
  // Which filter's options are open, if any — the panel names the filter and
  // what it belongs to, this screen owns the dialog, exactly as it owns the
  // resize one.
  const [filtering, setFiltering] = useState<FilterTarget | null>(null);
  // Bumped when the page changes shape under the view, so the canvas can fit the
  // sheet again — see `PaintCanvas`'s `refitToken`.
  const [refitToken, setRefitToken] = useState(0);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const drawing = store.activeDrawing;

  // How the tool in hand is tuned, and how wide it draws. Two reads of the
  // dials: the panel wants every dial the tool offers so it has a slider per
  // one, and the canvas wants only the dials actually moved, because that is
  // what a stroke records (see `plugins/dials.ts`). The width is per tool —
  // `toolSize` answers with the plugin's own default for a tool nobody has
  // resized (see `useAppSettings.ts`).
  const activePlugin = pluginById(tool);
  const tuning = settings.toolDials[tool];
  const dialValues = resolveDials(activePlugin, tuning);
  const inkDials = tunedDials(activePlugin, tuning);
  const size = toolSize(settings, tool);
  // …and the same two reads for the inks a tool carries of its own: the panel
  // wants every swatch it declares, the canvas only the ones re-coloured, which
  // is what a poured mark records (see `plugins/swatches.ts`).
  const inking = settings.toolColors[tool];
  const colorValues = resolveSwatches(activePlugin, inking);
  const inkColors = pickedSwatches(activePlugin, inking);

  // …and the same two reads for the *text* tool, whatever is in hand. A caption
  // is normally opened by the text tool, in which case these are the numbers
  // above — but a pasted line of words opens the same box with a pencil in your
  // hand, and setting it in a pencil's three-pixel nib would be type nobody can
  // read. The caption is the text tool's mark wherever it came from, so it is
  // always set at the text tool's size and tuning.
  const textSize = toolSize(settings, TEXT_TOOL_ID);
  const textDials = tunedDials(
    pluginById(TEXT_TOOL_ID),
    settings.toolDials[TEXT_TOOL_ID],
  );

  // The selection, worked out from the document rather than remembered
  // alongside it: the marks whose ids are picked and are still on the page, and
  // the box they cover. That is what keeps it honest through an undo, a delete
  // and a move — the ids are the only thing held, and everything else is a read.
  const selected = useMemo(() => {
    if (selectedIds.length === 0 || !drawing) return [];
    const picked = new Set(selectedIds);
    return drawing.strokes.filter((s) => picked.has(s.id));
  }, [drawing, selectedIds]);
  const selection = useMemo(() => {
    const box = selectionBox(selected);
    return box ? { ids: selected.map((s) => s.id), box } : null;
  }, [selected]);

  // A placement belongs to the page it was dropped on. Opening another drawing
  // with one still floating drops it rather than carrying it across — settling
  // it there would file the picture onto a page it was never dropped on.
  const openPage = drawing?.id;
  useEffect(() => setPlacement(null), [openPage]);
  // A caption belongs to the page it was begun on, for the same reason.
  useEffect(() => setTyping(null), [openPage]);
  // The panel is about the page it was opened over, so it closes with it — and
  // so does a filter's options, which are settings on that page and no other.
  useEffect(() => setLayersOpen(false), [openPage]);
  useEffect(() => setFiltering(null), [openPage]);
  // …and a selection names marks on *this* page, so it is dropped with the page
  // rather than carried onto one where those ids mean nothing.
  useEffect(() => {
    setSelectedIds([]);
    setMenuAt(null);
  }, [openPage]);

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

  /** Turn the whole page around, and look at what it became.
   *
   *  The store owns the edit and the undo step; the *view* is this screen's, and
   *  a page that has just been turned or resized is one the window is no longer
   *  pointed at — so the two travel together, and nowhere else has to remember
   *  that they do. */
  const transformPage = useCallback(
    (edit: Parameters<typeof store.transformActive>[0]) => {
      store.transformActive(edit);
      setRefitToken((n) => n + 1);
    },
    [store],
  );

  /** Keep the caption being typed: file the words as one mark on the page.
   *
   *  Nothing typed means nothing filed — an empty box is a press that changed
   *  its mind, and it should cost neither a mark nor an undo step. */
  const commitText = useCallback(() => {
    setTyping((current) => {
      if (!current) return null;
      // Trailing blank lines are the Enter you pressed on the way out, not part
      // of the caption.
      const words = current.text.replace(/\s+$/, "");
      if (words) {
        store.addStroke(
          textStroke(words, current.at, {
            color: settings.color,
            size: textSize,
            font: settings.textFont,
            bold: settings.textBold,
            italic: settings.textItalic,
            opacity: textDials.opacity,
          }),
          // A caption typed past the sheet's edge grows the sheet around it,
          // exactly as a picture dropped past it does.
          { fitPage: true },
        );
      }
      return null;
    });
  }, [
    store,
    textSize,
    settings.color,
    settings.textFont,
    settings.textBold,
    settings.textItalic,
    textDials.opacity,
  ]);

  /** The middle of the window, in document coordinates — where something that
   *  arrives without a place of its own lands: a pasted picture, a pasted line
   *  of words. `null` before the canvas has been measured. */
  const viewCenter = useCallback((): Point | null => {
    if (!view || !surfaceRef.current) return null;
    return toDocumentPoint(view, {
      x: surfaceRef.current.clientWidth / 2,
      y: surfaceRef.current.clientHeight / 2,
    });
  }, [view]);

  /** Float a picture over the page, waiting to be placed — where a drop, a
   *  paste and the sidebar's image drop all end up. */
  const place = useCallback(
    (image: ImportedImage) => {
      if (!drawing) return;
      setPlacement(initialPlacement(image, drawing, viewCenter()));
    },
    [drawing, viewCenter],
  );

  // --- What a selection is for ------------------------------------------------

  /** Keep the selected marks: on the system clipboard, so they can be pasted
   *  into another tab or another sketchbook, and in this screen's own hand in
   *  case the browser won't give them back.
   *
   *  `data` is the `DataTransfer` of a real `copy` / `cut` event when there is
   *  one — that path needs no permission and never fails, so it is the one the
   *  keyboard takes. The menu has no event and falls back to asking. */
  const copySelection = useCallback(
    (data?: DataTransfer | null) => {
      if (selected.length === 0) return false;
      copied.current = selected.map(({ id: _id, layer: _layer, ...s }) => s);
      const text = encodeStrokes(selected);
      if (data) data.setData("text/plain", text);
      else void writeStrokes(selected);
      return true;
    },
    [selected],
  );

  const deleteSelection = useCallback(() => {
    if (selectedIds.length === 0) return;
    store.deleteStrokes(selectedIds);
    setSelectedIds([]);
  }, [store, selectedIds]);

  /** Put marks on the page and leave them selected — which is what makes
   *  "paste, then drag it where you wanted it" one gesture rather than two.
   *
   *  `at` puts their top-left corner exactly there (the menu's paste, which
   *  lands where you opened it); without it they arrive a nudge from where they
   *  were copied, the way a paste always has. */
  const pasteStrokes = useCallback(
    (strokes: readonly DraftStroke[], at?: Point) => {
      if (strokes.length === 0) return;
      const by = at
        ? offsetTo(strokes, at)
        : { x: PASTE_NUDGE, y: PASTE_NUDGE };
      const ids = store.addStrokes(translateStrokes(strokes, by.x, by.y), {
        fitPage: true,
      });
      setSelectedIds(ids);
    },
    [store],
  );

  /** Land whatever a paste turned out to be holding.
   *
   *  Three kinds, three destinations, and none of them is a special case of
   *  another: marks go straight onto the page and stay selected; a picture opens
   *  the same placement frame a drop does, because a pasted screenshot needs
   *  sizing as much as a dropped one; and **words open the caption box** rather
   *  than becoming a mark on the spot, so the typeface, the weight and the size
   *  are still yours to change before they land. */
  const applyPaste = useCallback(
    (payload: PastePayload, at?: Point) => {
      if (payload.kind === "strokes") {
        pasteStrokes(payload.strokes, at);
        return;
      }
      if (payload.kind === "image") {
        place(payload.image);
        return;
      }
      const where = at ?? viewCenter();
      if (!where) return;
      // Anything already being typed is kept first, exactly as a second press
      // of the text tool would keep it.
      commitText();
      setTyping({ at: where, text: payload.text });
    },
    [pasteStrokes, place, viewCenter, commitText],
  );

  /** Where the selection's menu was opened, on the page — the menu holds a
   *  viewport point, because that is what a floating menu is placed with, and a
   *  paste from it wants the document point under the same pixel. */
  const menuOnPage = useCallback((): Point | null => {
    const surface = surfaceRef.current;
    if (!menuAt || !view || !surface) return null;
    const rect = surface.getBoundingClientRect();
    return toDocumentPoint(view, {
      x: menuAt.x - rect.left,
      y: menuAt.y - rect.top,
    });
  }, [menuAt, view]);

  /** The menu's Paste, which has no event to read: ask the clipboard, and fall
   *  back to whatever this app last copied when it won't answer. */
  const pasteFromSystem = useCallback(
    (at?: Point) => {
      void readSystemClipboard()
        .catch(() => null)
        .then((payload) => {
          if (payload) applyPaste(payload, at);
          else if (copied.current) pasteStrokes(copied.current, at);
        });
    },
    [applyPaste, pasteStrokes],
  );

  // The clipboard's own events. `copy` and `cut` are listened for rather than
  // driven from a key handler because that is the one path a browser lets a page
  // *write* the clipboard on without asking anyone's permission — and `paste`
  // likewise hands its contents over with no prompt at all, which is why ⌘V
  // works here and the menu's Paste has to ask.
  //
  // A field or a dialog that is open owns them: ⌘C in the caption box copies the
  // words, and pasting into it pastes into it (see `keys.ts`).
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (fieldHasKeyboard(e.target)) return;
      if (!copySelection(e.clipboardData)) return;
      e.preventDefault();
    };
    const onCut = (e: ClipboardEvent) => {
      if (fieldHasKeyboard(e.target)) return;
      if (!copySelection(e.clipboardData)) return;
      e.preventDefault();
      deleteSelection();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (fieldHasKeyboard(e.target)) return;
      const data = e.clipboardData;
      if (!data) return;
      e.preventDefault();
      void readPaste(data)
        .catch(() => null)
        .then((payload) => {
          if (payload) applyPaste(payload);
        });
    };
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCut);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCut);
      window.removeEventListener("paste", onPaste);
    };
  }, [copySelection, deleteSelection, applyPaste]);

  // The keys the clipboard events don't carry: rubbing the selection out, and
  // putting it down again. ⌘/Ctrl+A is offered only under the marquee — "select
  // everything" means nothing with a pencil in your hand, and swallowing the
  // browser's own select-all there would be a nuisance.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (fieldHasKeyboard(e.target)) return;
      const held = e.metaKey || e.ctrlKey;
      if (!held && (e.key === "Delete" || e.key === "Backspace")) {
        if (selectedIds.length === 0) return;
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (!held && e.key === "Escape") {
        if (selectedIds.length === 0 && !menuAt) return;
        setSelectedIds([]);
        setMenuAt(null);
        return;
      }
      if (held && e.key.toLowerCase() === "a") {
        if (!pluginById(tool)?.selects || !drawing) return;
        e.preventDefault();
        setSelectedIds(
          strokesInBox(drawing, {
            x: 0,
            y: 0,
            width: drawing.width,
            height: drawing.height,
          }).map((s) => s.id),
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [deleteSelection, selectedIds.length, menuAt, tool, drawing]);

  // Picking another tool finishes the caption rather than abandoning it: the
  // words are on the page in front of you, and reaching for the eraser to rub
  // something else out should not be what throws them away.
  const lastTool = useRef(tool);
  useEffect(() => {
    if (lastTool.current === tool) return;
    lastTool.current = tool;
    commitText();
  }, [tool, commitText]);

  /** Pick a tool — and, when it is one of a family, remember it as that
   *  family's. The shapes button has to wear *a* shape while you are holding the
   *  pencil, and the one you used last is the only answer worth giving. */
  const pickTool = useCallback(
    (id: string) => {
      update("activeTool", id);
      const plugin = pluginById(id);
      const group = plugin && groupOf(plugin);
      if (!group || settings.groupTools[group.id] === id) return;
      update("groupTools", { ...settings.groupTools, [group.id]: id });
    },
    [update, settings.groupTools],
  );

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
        // Land it where you were looking: the middle of the window, in document
        // coordinates. A picture bigger than the sheet lands at the origin
        // instead and takes the page over (see `initialPlacement`).
        .then(place)
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
      {/* The header pads by the top safe-area inset and nothing on top of it,
          so its title and buttons sit clear of the status bar / Dynamic Island
          in the installed iOS PWA, which paints edge to edge
          (`viewport-fit=cover`), without a band of dead surface above them.
          The inset is already generous: on an island phone it is 59px while
          the island's bottom edge is at ~48px, so the buttons still breathe
          ~11px below it — near enough the 9px (`pb-2` + the border) between
          them and the canvas that the row reads centred in its own bar. The
          extra 0.5rem this used to add made that gap 19px, twice the one
          below, and the header sat visibly low. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 pb-2 pt-[env(safe-area-inset-top)]">
        {/* The way to the drawings. It leads the header — left of the name,
            where every app that has a list behind it puts one — and it replaces
            the button that used to float over the canvas, which spent a corner
            of the page on a control the header had room for. */}
        <HeaderIconButton
          label={menuOpen ? t("menu.close") : t("menu.open")}
          pressed={menuOpen}
          onClick={onToggleMenu}
        >
          <MenuIcon className="h-[18px] w-[18px]" />
        </HeaderIconButton>

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
          {/* The disk — the layers' save. Gone entirely without a backend
              that can take one, rather than dimmed: on the on-device
              sketchbook there is nowhere to file layers to, and a permanently
              dead button is worse than no button. */}
          {layerSave && (
            <SaveButton
              layerSave={layerSave}
              ink={{ pageColor, defaultInk: ink }}
            />
          )}
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
          {/* The right-hand panel's other door, and the last thing in the
              header — the button that opens a panel from the right edge sits at
              that edge, next to the gesture that does the same job. The swipe
              is the phone gesture; this button is how it is *found*, which is
              also why it wears the panel rather than the layer stack: what
              slides in holds the page actions too. Gone entirely on a screen
              wide enough to dock the panel — a button that opens something
              already open is a button that lies. */}
          {!dockPanel && (
            <HeaderIconButton
              label={t("layers.open")}
              pressed={layersOpen}
              onClick={() => setLayersOpen((open) => !open)}
            >
              <SidePanelIcon className="h-[18px] w-[18px]" />
            </HeaderIconButton>
          )}
          {/* No bin either. Throwing a drawing away is an action on the
              document, so it sits at the head of the right-hand panel's Image
              section with resize and flip (see `SidePanel.tsx`). The header
              keeps the width for the title, and the destructive action stays
              out of thumb's reach of the star and the download menu. */}
        </div>
      </header>

      {/* The window onto the page, and — where the screen is wide enough — the
          panel docked beside it. `min-h-0` matters on both: it lets the flex
          children actually shrink to the space left over rather than pushing
          the toolbar off the bottom. */}
      <div className="flex min-h-0 flex-1">
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
              size,
              dials: inkDials,
              colors: inkColors,
              filled: settings.filled,
            }}
            defaultInk={ink}
            showGrid={settings.showGrid}
            fitToken={fitToken}
            refitToken={refitToken}
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
              dockPanel || layersOpen || menuSwipeEdge === "right"
                ? null
                : "right"
            }
            onPanelSwipe={() => setLayersOpen(true)}
            onCommit={store.addStroke}
            // The selection gesture: the marks its outline caught become the
            // selection, and nothing reaches the document. What the outline *is*
            // — a box, an oval, a lasso loop, an area traced off the page — is
            // the tool's business; this end takes contours either way. A gesture
            // that chose nothing sends `null` and clears it.
            selection={selection}
            onSelectRegion={(region: Point[][] | null) =>
              setSelectedIds(
                region && drawing
                  ? strokesInRegion(drawing, region).map((s) => s.id)
                  : [],
              )
            }
            // …and the hand's drag on it: the whole move, as one edit, once the
            // finger lifts.
            onMoveSelection={(dx, dy) => store.moveStrokes(selectedIds, dx, dy)}
            onContextMenu={setMenuAt}
            // The dropper's press: the colour it sampled becomes the ink, pinned
            // the same way picking a swatch pins one.
            onPickColor={(picked) => update("color", picked)}
            // The text tool's press: a caret opens where it landed. Pressing
            // again while one is open keeps what is in it first, so a second
            // caption never eats the first.
            onEnterText={(at) => {
              commitText();
              setTyping({ at, text: "" });
            }}
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

          {/* The caption being typed, in the face and size it will land in. The
            layer under it takes a press anywhere else on the page as "I'm
            done", which is how a caption is normally finished. */}
          {typing && view && (
            <TextEntry
              view={view}
              at={typing.at}
              value={typing.text}
              onChange={(text) =>
                setTyping((current) => (current ? { ...current, text } : null))
              }
              // Dragging the box re-anchors the caption. It is only ever the
              // anchor that moves — the words, the face and the ink are the
              // same mark, filed wherever it was let go of.
              onMove={(where) =>
                setTyping((current) =>
                  current ? { ...current, at: where } : null,
                )
              }
              ink={{
                color: settings.color ?? ink,
                size: textSize,
                font: settings.textFont,
                bold: settings.textBold,
                italic: settings.textItalic,
                opacity: textDials.opacity ?? 1,
              }}
              onFontChange={(font) => update("textFont", font)}
              onBoldChange={(bold) => update("textBold", bold)}
              onItalicChange={(italic) => update("textItalic", italic)}
              onCommit={commitText}
              onCancel={() => setTyping(null)}
            />
          )}

          {/* The layers panel, and the sheet of nothing that closes it. A press
            on the page dismisses the panel rather than drawing — the same
            "click outside it" rule a floating menu follows — while the header
            and the toolbar stay live, so picking a colour for the layer you
            just selected doesn't cost you the panel. */}
          {layersOpen && !dockPanel && (
            <>
              <div
                className="absolute inset-0 z-10"
                onPointerDown={() => setLayersOpen(false)}
                aria-hidden="true"
              />
              <SidePanel
                store={store}
                drawing={drawing}
                pageColor={pageColor}
                defaultInk={ink}
                onResize={() => {
                  setLayersOpen(false);
                  setResizing(true);
                }}
                // The floating panel gets out of the way of its own dialog —
                // on a phone the two would be stacked over the page it is
                // about, and the panel is what you were leaving anyway.
                onFilter={(target) => {
                  setLayersOpen(false);
                  setFiltering(target);
                }}
                onTransform={transformPage}
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

        {/* Docked: a column of its own, always there, taking width from the
            canvas rather than covering it. */}
        {dockPanel && (
          <SidePanel
            store={store}
            drawing={drawing}
            pageColor={pageColor}
            defaultInk={ink}
            docked
            onResize={() => setResizing(true)}
            onFilter={setFiltering}
            onTransform={transformPage}
            onClose={() => undefined}
          />
        )}
      </div>

      {/* No empty-state hint. A blank sheet with a toolbar under it already
          says "draw here", and a paragraph of instructions between the page and
          the tools was two lines of reading in the way of the first mark — on a
          phone it pushed the toolbar down as well. The gestures are in the docs
          and, for panning, in the hand tool that is now in the toolbar. */}

      <Toolbar
        tool={tool}
        onToolChange={pickTool}
        settings={settings}
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
        size={size}
        onSizeChange={(next) => palette.setSize(tool, next)}
        presets={presetsFor(settings, tool)}
        onApplyPreset={(preset) => palette.applyPreset(tool, preset)}
        // A preset captures the tool as it is set *now*: the width the toolbar
        // is holding and every dial resolved, which is the fuller of the two
        // reads and the one that can put a dial back as well as away (see
        // `ToolPreset.dials`).
        onSavePreset={(name, glyph) =>
          palette.savePreset(tool, name, size, dialValues, glyph)
        }
        onDeletePreset={(id) => palette.deletePreset(tool, id)}
        dialValues={dialValues}
        onDialChange={(dial, value) => palette.setDial(tool, dial, value)}
        colorValues={colorValues}
        onToolColorChange={(swatch, color) =>
          palette.setColor(tool, swatch, color)
        }
        onResetDials={() => palette.resetDials(tool)}
        // One reset for the panel, so one answer to "is this tool as it
        // ships?": a dial off its default, or an ink off the one the tool was
        // built with, and either offers it.
        dialsTuned={
          Object.keys(inkDials).length > 0 || hasPicked(activePlugin, inking)
        }
        filled={settings.filled}
        onFilledChange={(filled) => update("filled", filled)}
      />

      {/* The selection's menu — what a right-click opens on a desktop and a long
          press opens on touch. The same three actions the keyboard has, plus the
          one it can't reach without a keyboard at all: paste, and paste *here*,
          which is the only way to say where on a phone. */}
      <ContextMenu
        position={menuAt}
        onClose={() => setMenuAt(null)}
        ariaLabel={t("canvas.selectionActions")}
        actions={[
          ...(selection
            ? [
                {
                  label: t("canvas.copy"),
                  icon: <CopyIcon className="h-4 w-4" />,
                  onSelect: () => copySelection(),
                },
                {
                  label: t("canvas.cut"),
                  icon: <ScissorsIcon className="h-4 w-4" />,
                  onSelect: () => {
                    copySelection();
                    deleteSelection();
                  },
                },
              ]
            : []),
          {
            label: t("canvas.paste"),
            icon: <PasteIcon className="h-4 w-4" />,
            // Where the menu was opened, in document coordinates — a paste from
            // here lands under the finger that asked for it.
            onSelect: () => pasteFromSystem(menuOnPage() ?? undefined),
          },
          ...(selection
            ? [
                {
                  label: t("common.delete"),
                  icon: <TrashIcon className="h-4 w-4" />,
                  danger: true,
                  onSelect: deleteSelection,
                },
              ]
            : []),
        ]}
      />

      {/* A filter's options. Mounted only while they are open, so the sliders
          always start from what the page is actually set to — and nothing lands
          on the drawing until Apply (see `FilterModal`). */}
      {filtering &&
        (() => {
          const descriptor = filterDescriptor(filtering.kind);
          if (!descriptor) return null;
          // The same dialog either way; only who it reads from and writes to
          // changes with the target it was opened for.
          const on = filtering.layerId;
          const held = on
            ? layerFilterOf(drawing, on, filtering.kind)
            : filterOf(drawing, filtering.kind);
          return (
            <Suspense fallback={null}>
              <FilterModal
                descriptor={descriptor}
                filter={held ?? null}
                scope={on ? "layer" : "page"}
                onCancel={() => setFiltering(null)}
                onApply={(filter) => {
                  if (on) store.setLayerFilter(on, filter);
                  else store.setFilter(filter);
                  setFiltering(null);
                }}
                onRemove={() => {
                  if (on) store.clearLayerFilter(on, filtering.kind);
                  else store.clearFilter(filtering.kind);
                  setFiltering(null);
                }}
              />
            </Suspense>
          );
        })()}

      {/* Resizing — the one page action with a question to ask. Mounted only
          while it is open, so each answer starts from the page's own size. */}
      {resizing && (
        <Suspense fallback={null}>
          <ResizeModal
            drawing={drawing}
            onCancel={() => setResizing(false)}
            onScale={(to, sampling: Sampling) => {
              transformPage((d) => scaleDrawing(d, to, sampling));
              setResizing(false);
            }}
            onCanvas={(to, anchor: ResizeAnchor) => {
              transformPage((d) => resizeCanvas(d, to, anchor));
              setResizing(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
