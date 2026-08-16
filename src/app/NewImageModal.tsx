// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  Button,
  CloseIcon,
  CopyIcon,
  ImageUpIcon,
  LABELED_FIELD_CLASS,
  Modal,
  SegmentedControl,
  SpinnerIcon,
} from "@niclaslindstedt/oss-framework/components";
import {
  dragHasFilesOfType,
  firstFileOfType,
  useFileDrop,
} from "@niclaslindstedt/oss-framework/hooks";

import {
  currentScreenCanvasSize,
  CUSTOM_CANVAS,
  flipOrientation,
  MAX_CANVAS_SIDE,
  MIN_CANVAS_SIDE,
  orientationOf,
  orientSize,
  parseCanvasSize,
  sizePresets,
  type CanvasSize,
  type Orientation,
} from "./canvasSize.ts";
import {
  canvasShelf,
  SOLID_STOCK,
  type CanvasPreset,
  type ShelfItem,
} from "./canvasPresets.ts";
import { SizeShelf } from "./SizeShelf.tsx";
import {
  CHECKER_SQUARE,
  checkerColors,
  isDarkColor,
  pageColorName,
  PAGE_SWATCHES,
  resolvePageColor,
} from "./canvas.ts";
import {
  canLookAtClipboard,
  clipboardCanBeRead,
  pasteClipboardImage,
  peekClipboardImage,
} from "./clipboard.ts";
import {
  afterPaste,
  afterPeek,
  looking,
  pastedImage,
  tabEnabled,
  tabShown,
  type ClipboardSource,
} from "./clipboardSource.ts";
import { defaultGrain } from "./ground.ts";
import { GroundPicker } from "./GroundPicker.tsx";
import { useT } from "./i18n/index.ts";
import {
  imageFileStem,
  importImageFile,
  type ImportedImage,
} from "./images.ts";
import { PCT_EXTENSION } from "./pct.ts";
import type { Drawing, Ground } from "./types.ts";
import * as output from "../output.ts";

// Where an image comes from — the one dialog between pressing New and having a
// page in front of you.
//
// **An image, not a drawing**: what starts here is as often a photo off the
// disk or a screenshot off the clipboard as it is an empty sheet, and calling
// the dialog "New drawing" told two of its three answers they were in the wrong
// place. The thing being made is a page with something on it.
//
// It asks four questions, in that order. **What is this page made of**: an
// empty page, a picture from disk, or whatever is on the clipboard. For an
// empty one, **how big is it** — asked once, here, because a page never reflows
// (see `types.ts`), so the size is part of creating the thing rather than a
// setting to find afterwards. A page made *from a picture* skips that one: it
// is the size of the picture, which is the only answer that isn't a crop. Then
// **what colour is the page**, and **what is the sheet made of**.
//
// **The page's colour and its sheet are asked here, and only here.** The sheet
// because a stock is not a filter over the page — a wet mark is painted *into*
// the sheet it was made on, mixing with what it is over and dragging the marks
// it crosses out into its water (see `ground.ts`) — so moving a finished
// painting onto rough paper would repaint every mark on it as something the
// hand that drew them never saw. The colour because it is the same class of
// answer as the size: what the page **is**, fixed when the page is made, and
// carried on the drawing rather than in a preference that would repaint every
// page at once. The two are asked in that order because the colour is the
// ground the sheets are shown *on*: pick a black page and the stock swatches
// are that black page on each stock rather than a stranger's.
//
// **The default colour is no colour**, drawn as the chequer that means it
// everywhere else in the trade. An image is as often something to drop onto a
// page somebody else owns as it is a sketch on a sheet of its own, and a page
// that starts with nothing behind it exports with nothing behind it without
// anybody having to find a setting. There is deliberately no "follow the app
// theme" cell any more: that was a third state that looked like a colour, was
// not one, and quietly repainted finished work when the app theme changed.
//
// **Grain rides with the stock**, as the slider under the shelf. It is the one
// thing about a sheet that is a matter of looking rather than of paint (see
// `groundProfile`), so it could have stayed a setting — but it belongs to the
// sheet, and putting it here buys the thing a grain dial is actually for: the
// whole shelf repaints as you drag it, so you watch the tooth come up instead
// of taking a number on trust.
//
// **A page can also be one you set up yourself.** A canvas preset — a name, a
// size, and optionally the kit of tools that page is worked with — stands on the
// shelf beside the shipped sizes and is picked exactly like one (see
// `canvasPresets.ts`). Making a page on one writes its id onto the drawing, which
// is what brings the sketchbook's pencil-and-eraser back when the page is opened
// again tomorrow. Which shipped sizes are on the shelf at all is the same
// question answered from the other end, in Settings → Canvas.
//
// The three sources are a segmented control rather than three buttons because
// they are the same act — start an image — from three places, and only one of
// them can be true at a time.
//
// **Clipboard is the awkward one**, because "is there a picture on the
// clipboard" is a question some browsers won't answer quietly. Where a look is
// free the tab keeps its old manners: it appears when there is something to
// paste and stays away when there isn't, since a tab that is always there and
// usually says "nothing here" is a tab that teaches you to skip it. Where a look
// is *not* free — every WebKit, so every installed iOS PWA — the dialog must not
// take one on opening: doing that put the system's own Paste button on screen in
// answer to a press nobody made, and then timed out and pulled the tab away
// while the user was still reading it. So there the tab is simply offered, and
// looking is a button inside it. See `clipboard.ts` and `clipboardSource.ts`.
//
// **The sizes are drawn, not listed** — see `SizeShelf.tsx`, which owns the
// shelf, the typed page, and the flip that stands all of them the other way up.
//
// **It is a full-screen sheet on a phone and a card on a desktop** (the
// framework `Modal`'s uncentered shape), because four questions and two shelves
// of pictures do not fit a phone-sized card — they scrolled it into a letterbox
// with the Create button pushed off the bottom. Now the title bar and the
// buttons are pinned and only the questions between them move.

/** Which of the three the dialog is showing. */
type Source = "blank" | "file" | "clipboard";

/** What a page is made of beyond its size — every answer this dialog collects
 *  that is written onto the drawing itself.
 *
 *  One object rather than a parameter each, because these arrive together by
 *  construction: they are what the page *is*, decided in one press of Create.
 *  A key is absent rather than `undefined` when the answer was the default, so
 *  the caller can spread it straight onto a fresh drawing — a page on the plain
 *  solid sheet carries no ground at all, which is what every drawing made before
 *  surfaces existed is. */
export type PageMakeup = {
  ground?: Ground;
  background?: string;
  /** The canvas preset this page was made on, by id — absent for a page made at a
   *  shipped size or a typed one. It is the only answer here that is not about
   *  what the page is made *of*: it rides along because it is decided by the
   *  same press, and because what it buys is read off the drawing later (see
   *  `Drawing.canvasPreset`). */
  canvasPreset?: string;
  /** The page has no sheet at all — the marks land on nothing. Exclusive with
   *  `background`, and the default: it is the background layer's eye rather than
   *  a field on the drawing, so the caller turns it into a stack (see
   *  `transparentLayers`) rather than writing a colour that means "no colour". */
  transparent?: true;
};

type Props = {
  /** The folder the image will be filed into, named for the title — so
   *  "New image in Diagrams" says where it is about to land. */
  folderName?: string;
  /** The pages the user has set up for themselves, and the shipped sizes they
   *  have taken off the shelf (see `canvasPresets.ts`). Handed in rather than read
   *  from the settings here, so this dialog stays a function of its props. */
  canvasPresets: readonly CanvasPreset[];
  hiddenSizes: readonly string[];
  /** Whether the app itself is painting dark — which decides the two greys the
   *  transparency chequer is drawn in, and the sheet the stock shelf is shown on
   *  while the page has no colour of its own. */
  dark: boolean;
  onCancel: () => void;
  /** Make an empty page of this size, made of this. */
  onCreate: (size: CanvasSize, page: PageMakeup) => void;
  /** Make a page from a picture: cut to its size, named for where it came
   *  from, made of the same. */
  onCreateFromImage: (
    image: ImportedImage,
    name: string,
    page: PageMakeup,
  ) => void;
  /** Open a `.pct` — a whole drawing, layers and marks and all, rather than a
   *  picture to start one from (see `pct.ts`). It arrives with its own page
   *  size and stack, so nothing here chooses either. */
  onOpenPct: (drawing: Drawing, name: string) => void;
};

/** What the File tab is holding, once something has been picked.
 *
 *  Two kinds, because a picked file is one of two quite different things: a
 *  *picture* that a new page will be cut to the size of, or a *drawing* that
 *  already knows its own size, stack and marks. Both preview through the same
 *  thumbnail — for the container that is the `preview.png` it carries, which is
 *  why the reader hands one back. */
type Picked =
  | { kind: "image"; image: ImportedImage; name: string }
  | { kind: "pct"; drawing: Drawing; thumb: ImportedImage; name: string };

/** Which cell of the size shelf is in hand: its id, the page it stands for, and
 *  — for one of the user's own — the canvas preset that page will be made on. */
type Cell = { id: string; size: CanvasSize; canvasPreset?: string };

/** The cell a fresh dialog opens on: the first one on the shelf, or none at all
 *  where every size has been hidden and no canvas preset stands in their place. */
function firstCell(shelf: readonly ShelfItem[]): Cell | null {
  const first = shelf[0];
  if (!first) return null;
  return cellFor(first);
}

/** One shelf item as the cell in hand. */
function cellFor(item: ShelfItem): Cell {
  return {
    id: item.id,
    size: item.size,
    ...(item.kind === "preset" ? { canvasPreset: item.id } : {}),
  };
}

/** Whether a picked file is a paint container. Matched on the extension: the
 *  OS has no MIME type registered for `.pct`, so a browser hands one over as an
 *  empty type or `application/zip` depending on its mood. */
function isPctFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(`.${PCT_EXTENSION}`);
}

/** Whether a drag carries a file at all. A drag exposes its items' *types*, not
 *  their names, and a container has no type to match on — so the most a
 *  dragover can honestly say is "there is a file here", and the drop itself
 *  decides. Getting this wrong costs a highlight, not a file. */
function dragHasPct(dt: DataTransfer | null): boolean {
  return Array.from(dt?.items ?? []).some((item) => item.kind === "file");
}

export function NewImageModal({
  folderName,
  canvasPresets,
  hiddenSizes,
  dark,
  onCancel,
  onCreate,
  onCreateFromImage,
  onOpenPct,
}: Props) {
  const t = useT();
  // The screen is read once, when the dialog opens: it is the default answer,
  // and it can't change while the dialog is in front of you.
  const [screen] = useState(currentScreenCanvasSize);
  // …and which way round the shelf stands, which starts as which way round that
  // screen is. Every size is turned to face it, so a phone held upright offers
  // upright pages instead of asking for the one it is obviously being asked for
  // (see `canvasSize.ts`).
  const [orientation, setOrientation] = useState<Orientation>(() =>
    orientationOf(screen),
  );
  // What is on the shelf: the shipped sizes that haven't been hidden, then the
  // pages the user set up themselves — all of them stood the way the shelf is
  // facing.
  const shelf = useMemo(
    () =>
      canvasShelf(
        sizePresets(screen, orientation),
        hiddenSizes,
        canvasPresets,
        orientation,
      ),
    [screen, orientation, hiddenSizes, canvasPresets],
  );
  const [source, setSource] = useState<Source>("blank");
  // Which cell of the shelf is in hand — by id, with the page it stands for and
  // whether it is one of the user's own. The id is held rather than the size
  // alone because two cells can be the same page (a sketchbook quoted at A4's
  // pixels) and lighting both would say the wrong one was chosen; the size is
  // held beside it rather than looked up, so the cell survives its canvas preset
  // being edited in another tab.
  const [cell, setCell] = useState<Cell | null>(() => firstCell(shelf));
  // The typed page, and whether it is the one chosen. Held as text so a
  // half-typed number is the user's business rather than something to round on
  // every keystroke.
  const [custom, setCustom] = useState({
    width: String(CUSTOM_CANVAS.width),
    height: String(CUSTOM_CANVAS.height),
  });
  // …and it is the cell in hand from the start on a shelf with nothing on it,
  // which is what hiding every shipped size and keeping no canvas presets leaves.
  // A dialog whose only page is one you have to notice a cell for would open
  // unable to create anything.
  const [typedSize, setTypedSize] = useState(shelf.length === 0);
  // The sheet, by stock id — `undefined` is the plain solid page, and a page on
  // it carries no ground at all (see `ground.ts`), which is what every drawing
  // made before surfaces existed is.
  const [stock, setStock] = useState<string | undefined>(undefined);
  // …and how strongly its grain shows, as a multiple of the stock's own weight.
  // 1 is the sheet as it is sold, which is what a page that says nothing about
  // its grain is on.
  const [texture, setTexture] = useState(1);
  // The page's own colour — `undefined` is **no page at all**, which is what a
  // new image starts as (see `layers.ts`). Not "whatever the theme says": that
  // was a third state nobody could see, and a page either has a colour or it
  // doesn't.
  const [background, setBackground] = useState<string | undefined>(undefined);
  // What was chosen from disk, waiting for Create.
  const [picked, setPicked] = useState<Picked | null>(null);
  // What we know about the clipboard, which is a state rather than a picture
  // (see `clipboardSource.ts`).
  const [clip, setClip] = useState<ClipboardSource>({ kind: "looking" });
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Look at the clipboard as the dialog opens — but only if looking is free.
  // Where it isn't, the tab is offered with a button on it instead, and nothing
  // at all happens until that button is pressed. Every failure is "nothing
  // there" (see `clipboard.ts`), so neither path can leave the dialog stuck.
  useEffect(() => {
    let live = true;
    // A browser that won't hand the clipboard over on any terms gets no tab —
    // offering a button that can only ever come back empty is worse than not
    // offering one.
    if (!clipboardCanBeRead()) {
      setClip({ kind: "hidden" });
      return;
    }
    void canLookAtClipboard().then((free) => {
      if (!live) return;
      if (!free) {
        setClip({ kind: "ask" });
        return;
      }
      void peekClipboardImage().then((image) => {
        if (live) setClip(afterPeek(image));
      });
    });
    return () => {
      live = false;
    };
  }, []);

  /** Look because the user asked us to. Inside their press, so the browser's
   *  own prompt — iOS's Paste button — comes up in answer to a deliberate act,
   *  and we wait for it however long it takes. */
  const askClipboard = () => {
    setClip({ kind: "reading" });
    void pasteClipboardImage().then((image) => setClip(afterPaste(image)));
  };

  const take = (file: File | null | undefined) => {
    if (!file) return;
    if (isPctFile(file)) {
      void takePct(file);
      return;
    }
    void importImageFile(file)
      .then((image) => {
        setPicked({ kind: "image", image, name: imageFileStem(file.name) });
        setSource("file");
      })
      .catch((err: unknown) =>
        output.error(
          `Couldn't read that image — ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  };

  /** Read a picked container. The reader is loaded on demand — a zip codec is
   *  not something a dialog should cost until someone opens a file with it. */
  const takePct = async (file: File) => {
    try {
      const { readPct } = await import("./pctFile.ts");
      const opened = await readPct(file);
      setPicked({
        kind: "pct",
        drawing: opened.drawing,
        name: opened.drawing.name.trim() || imageFileStem(file.name),
        thumb: {
          // A container written by another tool may carry no preview; the tile
          // then shows the placeholder glyph, which is honest rather than a
          // blank box.
          src: opened.preview ?? "",
          width: opened.drawing.width,
          height: opened.drawing.height,
        },
      });
      setSource("file");
    } catch (err) {
      output.error(
        `Couldn't open that paint file — ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };

  // A picture dropped on the dialog is a picture chosen — the same gesture the
  // canvas and the drawer already take, landing in the same place. A `.pct`
  // dropped here is taken too, and `take` sorts out which it got: the drag is
  // matched on the file *name* rather than its type, because a container has no
  // registered MIME type to advertise (see `isPctFile`).
  const { active: dragging } = useFileDrop({
    targetRef: bodyRef,
    accepts: (dt) => dragHasFilesOfType(dt, "image/") || dragHasPct(dt),
    claim: true,
    onDrop: (files) =>
      take(files.find(isPctFile) ?? firstFileOfType(files, "image/")),
  });

  /** Turn the shelf, and everything standing on it: every cell (through
   *  `canvasShelf`), the page currently lit, and the typed one. The lit page is
   *  turned rather than reset because it is one of the rectangles on the shelf
   *  and it stays the same one — flip and flip back and you are where you
   *  started, with the same cell still chosen. */
  const flip = () => {
    const next = flipOrientation(orientation);
    setOrientation(next);
    setCell((current) =>
      current ? { ...current, size: orientSize(current.size, next) } : null,
    );
    setCustom((c) => ({ width: c.height, height: c.width }));
  };

  const customSize = parseCanvasSize(custom.width, custom.height);
  // The page a blank drawing would be made at: the typed one when Custom is the
  // cell in hand, otherwise whichever rectangle is lit.
  const blankSize = typedSize ? customSize : (cell?.size ?? null);

  const chosen =
    source === "file"
      ? picked?.kind === "pct"
        ? picked.thumb
        : picked?.image
      : undefined;
  const pasted = pastedImage(clip);
  const ready =
    (source === "blank" && blankSize) ||
    (source === "file" && picked) ||
    (source === "clipboard" && pasted);

  // A container brings its own page — its size, its colour, its stack and the
  // sheet it was painted on — so neither shelf is offered for one. Everything
  // else that starts here is a page this dialog is building.
  const openingPct = source === "file" && picked?.kind === "pct";
  const page: PageMakeup = {
    ...(stock
      ? { ground: { stock, ...(texture === 1 ? {} : { texture }) } }
      : {}),
    ...(background ? { background } : { transparent: true }),
    // …and which canvas preset made it, for a blank page made on one of the
    // user's own cells. A page cut from a picture is the size of the picture and
    // a typed one is nobody's canvas preset, so neither carries one.
    ...(source === "blank" && !typedSize && cell?.canvasPreset
      ? { canvasPreset: cell.canvasPreset }
      : {}),
  };
  // The page the stock shelf is painted on. A page with a colour is shown as
  // that colour; a page with none is shown on the sheet it *would* have, because
  // the shelf is a catalogue of sheets and a sheet with no page behind it has no
  // grain to compare (the tooth is painted as part of the page — see
  // `render.ts`). The ink in each swatch is read off that colour rather than off
  // the app theme, or picking a black page would draw the sample line in black
  // ink on it.
  const pageColor = resolvePageColor(background, dark);
  const pageIsDark = isDarkColor(pageColor);
  // What the chosen page is called — the swatch row is printed under, not
  // guessed at. `undefined` is the chequer, which has a name of its own.
  const backgroundName = pageColorName(background);
  const [checkerEven, checkerOdd] = checkerColors(dark);

  const create = () => {
    if (source === "blank") {
      if (blankSize) onCreate(blankSize, page);
    } else if (source === "file" && picked) {
      if (picked.kind === "pct") onOpenPct(picked.drawing, picked.name);
      else onCreateFromImage(picked.image, picked.name, page);
    } else if (source === "clipboard" && pasted) {
      onCreateFromImage(pasted, t("newImage.clipboardName"), page);
    }
  };

  const dimensions = (s: { width: number; height: number }) =>
    t("newImage.dimensions", {
      width: String(Math.round(s.width)),
      height: String(Math.round(s.height)),
    });

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="new-image-title"
      closeLabel={t("common.cancel")}
      footer={
        /* Pinned under the scrolling questions, so Create is on screen from the
           moment the dialog opens rather than at the end of a scroll. */
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={create} disabled={!ready}>
            {t("newImage.create")}
          </Button>
        </footer>
      }
    >
      {/* …and pinned above them, so the sheet still says what it is once the
          questions have scrolled past it. */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 py-3">
        <h2
          id="new-image-title"
          className="min-w-0 text-sm font-bold tracking-wide text-fg-bright"
        >
          {folderName
            ? t("newImage.titleIn", { name: folderName })
            : t("newImage.title")}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t("common.close")}
          className="-mr-1 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      {/* The drop target is the whole body — its highlight has to cover the
          questions wherever they happen to be scrolled to, so the scrolling
          box sits *inside* the positioned one rather than being it. */}
      <div ref={bodyRef} className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-4 overflow-y-auto overscroll-contain px-5 py-5">
          <SegmentedControl<Source>
            value={source}
            ariaLabel={t("newImage.sourceLabel")}
            onChange={setSource}
            fullWidth
            options={[
              { value: "blank", label: t("newImage.sourceBlank") },
              { value: "file", label: t("newImage.sourceFile") },
              // There unless a free look proved there is nothing to paste — and
              // dim only for the second such a look takes, never once the tab is
              // something you are meant to press.
              ...(tabShown(clip)
                ? [
                    {
                      value: "clipboard" as const,
                      label: t("newImage.sourceClipboard"),
                      disabled: !tabEnabled(clip),
                    },
                  ]
                : []),
            ]}
          />

          {source === "blank" && (
            <>
              <SizeShelf
                items={shelf}
                chosen={typedSize ? null : cell}
                custom={customSize}
                typed={typedSize}
                orientation={orientation}
                onFlip={flip}
                onPick={(item) => {
                  setTypedSize(false);
                  setCell(cellFor(item));
                  // A preset that says which sheet it is usually on puts that
                  // sheet in the picker below — as a starting point, not a
                  // decision: the shelf is still there, and Create takes
                  // whatever is in it (see `canvasPresets.ts`).
                  if (item.kind === "preset" && item.ground) {
                    setStock(
                      item.ground.stock === SOLID_STOCK
                        ? undefined
                        : item.ground.stock,
                    );
                    setTexture(item.ground.texture ?? 1);
                  }
                }}
                onPickCustom={() => setTypedSize(true)}
                dimensions={dimensions}
              />
              {typedSize && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-end gap-2">
                    <SideField
                      label={t("newImage.width")}
                      value={custom.width}
                      onChange={(width) => setCustom((c) => ({ ...c, width }))}
                    />
                    <span className="pb-2 text-sm text-muted">×</span>
                    <SideField
                      label={t("newImage.height")}
                      value={custom.height}
                      onChange={(height) =>
                        setCustom((c) => ({ ...c, height }))
                      }
                    />
                  </div>
                  <p
                    className={`text-xs ${customSize ? "text-muted" : "text-danger"}`}
                  >
                    {t("newImage.sizeHint", {
                      min: String(MIN_CANVAS_SIDE),
                      max: String(MAX_CANVAS_SIDE),
                    })}
                  </p>
                </div>
              )}
            </>
          )}

          {source === "file" && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-6 text-sm text-muted hover:border-accent hover:text-fg-bright"
              >
                {chosen?.src ? (
                  // The picture itself is the confirmation that the right file
                  // was picked — a file name is not.
                  <img
                    src={chosen.src}
                    alt=""
                    className="max-h-32 max-w-full rounded border border-line object-contain"
                  />
                ) : (
                  <ImageUpIcon className="h-6 w-6 text-accent" />
                )}
                <span>{chosen ? picked?.name : t("newImage.chooseImage")}</span>
              </button>
              <p className="text-xs text-muted tabular-nums">
                {picked?.kind === "pct"
                  ? t("newImage.pctChosen", {
                      layers: String(picked.drawing.layers?.length ?? 1),
                      dimensions: dimensions(picked.thumb),
                    })
                  : chosen
                    ? dimensions(chosen)
                    : t("newImage.chooseImageHint")}
              </p>
              <input
                ref={fileRef}
                type="file"
                accept={`image/*,.${PCT_EXTENSION}`}
                className="hidden"
                onChange={(e) => {
                  take(e.currentTarget.files?.[0]);
                  // Cleared so picking the same file twice still fires.
                  e.currentTarget.value = "";
                }}
              />
            </div>
          )}

          {source === "clipboard" && (
            <div className="flex flex-col gap-2">
              {/* One box, whatever the clipboard is currently worth saying: the
                picture itself, the spinner while a look is in flight, or the
                button that takes the look where we may not take it unasked. */}
              <div className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-lg border border-line px-4 py-4">
                {pasted ? (
                  <img
                    src={pasted.src}
                    alt=""
                    className="max-h-32 max-w-full rounded object-contain"
                  />
                ) : looking(clip) ? (
                  <SpinnerIcon className="h-5 w-5 text-muted" />
                ) : (
                  <>
                    <CopyIcon className="h-6 w-6 text-accent" />
                    <Button variant="secondary" onClick={askClipboard}>
                      {t(
                        clip.kind === "nothing"
                          ? "newImage.clipboardAgain"
                          : "newImage.clipboardPaste",
                      )}
                    </Button>
                  </>
                )}
              </div>
              <p className="text-xs text-muted tabular-nums">
                {pasted
                  ? dimensions(pasted)
                  : clip.kind === "reading"
                    ? t("newImage.clipboardWaiting")
                    : clip.kind === "nothing"
                      ? t("newImage.clipboardEmpty")
                      : t("newImage.clipboardAsk")}
              </p>
            </div>
          )}

          {/* What colour the page is, and then what it is made of. Under the
            source panels because they are the last two questions every path
            asks, in that order because the colour is the ground the stocks are
            shown on — and left out for a `.pct`, which arrives as a page of its
            own. */}
          {!openingPct && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {/* The question, and the answer beside it. The name of the sheet
                  in hand belongs *here* rather than under the row: a row of
                  round swatches shows the colours and says nothing about which
                  one you have got hold of — two of the three light sheets are a
                  hair apart — and the heading is where the eye already is. */}
              <span className="text-sm text-fg-bright">
                {t("newImage.pageColorLabel")}
                <span className="text-muted">
                  {" · "}
                  {t(backgroundName ?? "newImage.pageColorTransparent")}
                </span>
              </span>
              <div
                className="flex flex-wrap items-center gap-2"
                role="radiogroup"
                aria-label={t("newImage.pageColorLabel")}
              >
                {/* No page at all, first and by default — drawn as the chequer
                  it will be on the canvas, because "no colour" is the one
                  answer here that cannot be a colour. Round like the swatches
                  beside it: it is one of them, not an opt-out from them. */}
                <button
                  type="button"
                  role="radio"
                  aria-checked={background === undefined}
                  aria-label={t("newImage.pageColorTransparent")}
                  title={t("newImage.pageColorTransparent")}
                  onClick={() => setBackground(undefined)}
                  className={`h-7 w-7 cursor-pointer rounded-full border-2 ${
                    background === undefined ? "border-accent" : "border-line"
                  }`}
                  style={checkerStyle(checkerEven, checkerOdd)}
                />
                {PAGE_SWATCHES.map((swatch) => (
                  <button
                    key={swatch.color}
                    type="button"
                    role="radio"
                    aria-checked={swatch.color === background}
                    aria-label={t(swatch.nameKey)}
                    title={t(swatch.nameKey)}
                    onClick={() => setBackground(swatch.color)}
                    className={`h-7 w-7 cursor-pointer rounded-full border-2 ${
                      swatch.color === background
                        ? "border-accent"
                        : "border-line"
                    }`}
                    style={{ backgroundColor: swatch.color }}
                  />
                ))}
              </div>
            </div>
          )}

          {!openingPct && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <span className="text-sm text-fg-bright">
                {t("newImage.canvasTypeLabel")}
              </span>
              <GroundPicker
                value={stock}
                texture={texture}
                // Picking a stock takes its own grain with it: a rough sheet
                // opens with its tooth up where you can see it and a
                // hot-pressed one with barely any, because that is what each is
                // reached for (see `grainDefault`). The dial under the shelf
                // then moves it from there — it is a starting point, not a
                // ceiling, and switching stock is what re-answers it.
                onChange={(next) => {
                  const picked = next.family === "solid" ? undefined : next.id;
                  setStock(picked);
                  setTexture(defaultGrain(picked));
                }}
                pageColor={pageColor}
                dark={pageIsDark}
                label={t("newImage.canvasTypeLabel")}
              />
              {/* How far that sheet's tooth shows. Offered only where there is a
                  tooth to show: on the plain sheet it would be a slider that
                  moves nothing. It sits here rather than in Settings because it
                  is part of the sheet, and because the shelf above repaints at
                  it as you drag — the whole point of a grain dial is watching
                  the paper come up or go flat. */}
              {stock && (
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("newImage.grainLabel", {
                      value: String(Math.round(texture * 100)),
                    })}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={texture}
                    onChange={(e) =>
                      setTexture(Number((e.target as HTMLInputElement).value))
                    }
                    className="w-full cursor-pointer"
                  />
                </label>
              )}
              <p className="text-xs text-muted">
                {t("newImage.canvasTypeHint")}
              </p>
            </div>
          )}
        </div>

        {/* The same "you can drop that here" cue the canvas and the drawer
            show, so the gesture reads the same wherever it is offered. */}
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-surface/90 text-center">
            <span className="flex items-center gap-2 text-sm text-fg-bright">
              <ImageUpIcon className="h-4 w-4 shrink-0 text-accent" />
              {t("newImage.dropImage")}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The transparency chequer as a CSS background, for the swatch that stands for
 *  a page with none.
 *
 *  Two crossed gradients rather than an image, so it costs nothing and takes the
 *  same two colours the canvas paints (see `canvas.ts`) — the swatch and the
 *  page it stands for are the same chequer, which is the only reason the swatch
 *  reads as one. Half the canvas's square, because the swatch is a fraction of
 *  the size and one square of nothing is not a pattern. */
function checkerStyle(even: string, odd: string): CSSProperties {
  const size = CHECKER_SQUARE / 2;
  return {
    backgroundColor: even,
    backgroundImage: `linear-gradient(45deg, ${odd} 25%, transparent 25%, transparent 75%, ${odd} 75%), linear-gradient(45deg, ${odd} 25%, transparent 25%, transparent 75%, ${odd} 75%)`,
    backgroundSize: `${size * 2}px ${size * 2}px`,
    backgroundPosition: `0 0, ${size}px ${size}px`,
  };
}

/** One side of a typed page. A plain input rather than the framework's
 *  `LabeledInput`, which commits on blur and keeps its own draft — here the two
 *  sides are validated together on every keystroke so the Create button can go
 *  dim the moment the pair stops being a page. It wears the framework's field
 *  class, so it is the same box either way. */
function SideField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={MIN_CANVAS_SIDE}
        max={MAX_CANVAS_SIDE}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className={`${LABELED_FIELD_CLASS} tabular-nums`}
      />
    </label>
  );
}
