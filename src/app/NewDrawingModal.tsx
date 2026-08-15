// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import {
  Button,
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
  canvasPresets,
  currentScreenCanvasSize,
  CUSTOM_CANVAS,
  MAX_CANVAS_SIDE,
  MIN_CANVAS_SIDE,
  parseCanvasSize,
  previewScale,
  type CanvasPreset,
  type CanvasSize,
} from "./canvasSize.ts";
import { resolvePageColor } from "./canvas.ts";
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

// Where a drawing comes from — the one dialog between pressing New and having a
// page in front of you.
//
// It asks three questions, in that order. **What is this drawing made of**: an
// empty page, a picture from disk, or whatever is on the clipboard. For an empty
// one, **how big is it** — asked once, here, because a page never reflows (see
// `types.ts`), so the size is part of creating the thing rather than a setting
// to find afterwards. A drawing made *from a picture* skips that one: it is the
// size of the picture, which is the only answer that isn't a crop. And, for
// every drawing that starts here, **what is the sheet made of**.
//
// **The sheet is asked here, and only here.** A stock is not a filter over the
// page — a wet mark is painted *into* the sheet it was made on, mixing with what
// it is over and dragging the marks it crosses out into its water (see
// `ground.ts`) — so moving a finished painting onto rough paper would repaint
// every mark on it as something the hand that drew them never saw. It is the
// same class of answer as the size: what the page **is**, fixed when the page is
// made. What can still be changed afterwards, in Settings → Canvas, is how far
// the sheet's grain shows, which is a matter of looking rather than of paint.
//
// The three sources are a segmented control rather than three buttons because
// they are the same act — start a drawing — from three places, and only one of
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
// **The sizes are drawn, not listed.** Four rectangles at one shared scale
// answer "how much bigger is 4K than Full HD" and "is A4 taller than my screen"
// in the way a dropdown of numbers never did — the choice is a comparison, so
// the control is one too. Four named sizes is the whole list on purpose: past
// that the shelf stops being comparable and starts being a catalogue.
//
// **Custom** is the fifth cell, and it is drawn too: type a size and its
// rectangle takes its place on the shelf at the same scale as the rest, so a
// typed page is compared the way a named one is rather than being a number you
// have to imagine. It opens on a big square — the page nobody offers by name.

/** Which of the three the dialog is showing. */
type Source = "blank" | "file" | "clipboard";

type Props = {
  /** The folder the drawing will be filed into, named for the title — so
   *  "New drawing in Diagrams" says where it is about to land. */
  folderName?: string;
  /** Whether the page will be a dark sheet, so the surface swatches are painted
   *  on the page the drawing is about to open on. */
  dark: boolean;
  onCancel: () => void;
  /** Make an empty page of this size, on this sheet — `undefined` for the plain
   *  solid page, which is how a drawing with no ground at all is stored. */
  onCreate: (size: CanvasSize, ground: Ground | undefined) => void;
  /** Make a page from a picture: cut to its size, named for where it came
   *  from, on the chosen sheet. */
  onCreateFromImage: (
    image: ImportedImage,
    name: string,
    ground: Ground | undefined,
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

/** The box each preset is drawn inside, in CSS pixels. One scale is shared
 *  across the shelf, so this is the room the *largest* of them gets. */
const PREVIEW_BOX = { width: 104, height: 74 };

export function NewDrawingModal({
  folderName,
  dark,
  onCancel,
  onCreate,
  onCreateFromImage,
  onOpenPct,
}: Props) {
  const t = useT();
  // The screen is read once, when the dialog opens: it is the default answer,
  // and it can't change while the dialog is in front of you.
  const [presets] = useState(() => canvasPresets(currentScreenCanvasSize()));
  const [source, setSource] = useState<Source>("blank");
  const [size, setSize] = useState<CanvasSize>(
    () => presets[0]?.size ?? { width: 1920, height: 1080 },
  );
  // The typed page, and whether it is the one chosen. Held as text so a
  // half-typed number is the user's business rather than something to round on
  // every keystroke.
  const [custom, setCustom] = useState({
    width: String(CUSTOM_CANVAS.width),
    height: String(CUSTOM_CANVAS.height),
  });
  const [typedSize, setTypedSize] = useState(false);
  // The sheet, by stock id — `undefined` is the plain solid page, and a page on
  // it carries no ground at all (see `ground.ts`), which is what every drawing
  // made before surfaces existed is.
  const [stock, setStock] = useState<string | undefined>(undefined);
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

  const customSize = parseCanvasSize(custom.width, custom.height);
  // The page a blank drawing would be made at: the typed one when Custom is the
  // cell in hand, otherwise whichever rectangle is lit.
  const blankSize = typedSize ? customSize : size;

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

  // A container brings its own page — its size, its stack, and the sheet it was
  // painted on — so the surface shelf is not offered for one. Everything else
  // that starts here is a page this dialog is building.
  const openingPct = source === "file" && picked?.kind === "pct";
  const ground: Ground | undefined = stock ? { stock } : undefined;

  const create = () => {
    if (source === "blank") {
      if (blankSize) onCreate(blankSize, ground);
    } else if (source === "file" && picked) {
      if (picked.kind === "pct") onOpenPct(picked.drawing, picked.name);
      else onCreateFromImage(picked.image, picked.name, ground);
    } else if (source === "clipboard" && pasted) {
      onCreateFromImage(pasted, t("newDrawing.clipboardName"), ground);
    }
  };

  const dimensions = (s: { width: number; height: number }) =>
    t("newDrawing.dimensions", {
      width: String(Math.round(s.width)),
      height: String(Math.round(s.height)),
    });

  return (
    <Modal
      open
      onClose={onCancel}
      labelledBy="new-drawing-title"
      centered
      size="max-w-xl"
      closeLabel={t("common.cancel")}
      footer={
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={create} disabled={!ready}>
            {t("newDrawing.create")}
          </Button>
        </footer>
      }
    >
      <div ref={bodyRef} className="relative flex flex-col gap-4 px-5 py-5">
        <h2
          id="new-drawing-title"
          className="text-base font-bold text-fg-bright"
        >
          {folderName
            ? t("newDrawing.titleIn", { name: folderName })
            : t("newDrawing.title")}
        </h2>

        <SegmentedControl<Source>
          value={source}
          ariaLabel={t("newDrawing.sourceLabel")}
          onChange={setSource}
          fullWidth
          options={[
            { value: "blank", label: t("newDrawing.sourceBlank") },
            { value: "file", label: t("newDrawing.sourceFile") },
            // There unless a free look proved there is nothing to paste — and
            // dim only for the second such a look takes, never once the tab is
            // something you are meant to press.
            ...(tabShown(clip)
              ? [
                  {
                    value: "clipboard" as const,
                    label: t("newDrawing.sourceClipboard"),
                    disabled: !tabEnabled(clip),
                  },
                ]
              : []),
          ]}
        />

        {source === "blank" && (
          <>
            <SizeShelf
              presets={presets}
              value={blankSize}
              custom={customSize}
              typed={typedSize}
              onPick={(next) => {
                setTypedSize(false);
                setSize(next);
              }}
              onPickCustom={() => setTypedSize(true)}
              dimensions={dimensions}
            />
            {typedSize && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-end gap-2">
                  <SideField
                    label={t("newDrawing.width")}
                    value={custom.width}
                    onChange={(width) => setCustom((c) => ({ ...c, width }))}
                  />
                  <span className="pb-2 text-sm text-muted">×</span>
                  <SideField
                    label={t("newDrawing.height")}
                    value={custom.height}
                    onChange={(height) => setCustom((c) => ({ ...c, height }))}
                  />
                </div>
                <p
                  className={`text-xs ${customSize ? "text-muted" : "text-danger"}`}
                >
                  {t("newDrawing.sizeHint", {
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
              <span>{chosen ? picked?.name : t("newDrawing.chooseImage")}</span>
            </button>
            <p className="text-xs text-muted tabular-nums">
              {picked?.kind === "pct"
                ? t("newDrawing.pctChosen", {
                    layers: String(picked.drawing.layers?.length ?? 1),
                    dimensions: dimensions(picked.thumb),
                  })
                : chosen
                  ? dimensions(chosen)
                  : t("newDrawing.chooseImageHint")}
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
                        ? "newDrawing.clipboardAgain"
                        : "newDrawing.clipboardPaste",
                    )}
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted tabular-nums">
              {pasted
                ? dimensions(pasted)
                : clip.kind === "reading"
                  ? t("newDrawing.clipboardWaiting")
                  : clip.kind === "nothing"
                    ? t("newDrawing.clipboardEmpty")
                    : t("newDrawing.clipboardAsk")}
            </p>
          </div>
        )}

        {/* What the sheet is made of. Under the source panels because it is the
            last question either path asks, and left out for a `.pct`, which
            arrives on a sheet of its own. */}
        {!openingPct && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <span className="text-sm text-fg-bright">
              {t("newDrawing.surfaceLabel")}
            </span>
            <GroundPicker
              value={stock}
              onChange={(next) =>
                setStock(next.family === "solid" ? undefined : next.id)
              }
              pageColor={resolvePageColor(undefined, dark)}
              dark={dark}
              label={t("newDrawing.surfaceLabel")}
            />
            <p className="text-xs text-muted">{t("newDrawing.surfaceHint")}</p>
          </div>
        )}

        {/* The same "you can drop that here" cue the canvas and the drawer
            show, so the gesture reads the same wherever it is offered. */}
        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-surface/90 text-center">
            <span className="flex items-center gap-2 text-sm text-fg-bright">
              <ImageUpIcon className="h-4 w-4 shrink-0 text-accent" />
              {t("newDrawing.dropImage")}
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** The page sizes, drawn to one shared scale so they can be compared rather than
 *  read — the four named ones and the one you type. */
function SizeShelf({
  presets,
  value,
  custom,
  typed,
  onPick,
  onPickCustom,
  dimensions,
}: {
  presets: readonly CanvasPreset[];
  /** The page currently chosen, or `null` while a typed one is unusable. */
  value: CanvasSize | null;
  /** The typed page, or `null` when the fields don't describe one. */
  custom: CanvasSize | null;
  /** Whether the typed cell is the one in hand. */
  typed: boolean;
  onPick: (size: CanvasSize) => void;
  onPickCustom: () => void;
  dimensions: (size: CanvasSize) => string;
}) {
  const t = useT();
  // The typed page is on the shelf, so it is in the scale too: type a bigger
  // page than 4K and the whole shelf shrinks to keep the comparison honest.
  const scale = previewScale(
    [...presets.map((p) => p.size), custom ?? CUSTOM_CANVAS],
    PREVIEW_BOX,
  );
  return (
    <div
      className="grid grid-cols-3 gap-2 sm:grid-cols-5"
      role="radiogroup"
      aria-label={t("newDrawing.sizeLabel")}
    >
      {presets.map((preset) => {
        const active =
          !typed &&
          preset.size.width === value?.width &&
          preset.size.height === value.height;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onPick(preset.size)}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2 ${
              active
                ? "border-accent bg-accent/10"
                : "border-line hover:bg-surface-2"
            }`}
          >
            {/* The page itself, at the shelf's scale. The row of boxes is a
                fixed height so the rectangles sit on one baseline and only
                their own shapes differ. */}
            <span
              aria-hidden="true"
              className="flex items-end justify-center"
              style={{ height: `${PREVIEW_BOX.height}px` }}
            >
              <span
                className={`block rounded-[2px] border ${
                  active
                    ? "border-accent bg-accent/20"
                    : "border-muted bg-surface-2"
                }`}
                style={{
                  width: `${Math.max(6, Math.round(preset.size.width * scale))}px`,
                  height: `${Math.max(6, Math.round(preset.size.height * scale))}px`,
                }}
              />
            </span>
            <span
              className={`text-xs whitespace-nowrap ${
                active ? "text-accent" : "text-fg-bright"
              }`}
            >
              {t(`newDrawing.presets.${preset.id}`)}
            </span>
            <span className="text-[10px] whitespace-nowrap text-muted tabular-nums">
              {dimensions(preset.size)}
            </span>
          </button>
        );
      })}

      {/* The typed page, drawn like the rest — the fields for it appear under
          the shelf once this is the cell in hand. A size the fields can't make
          a page of shows as a dashed outline of the last usable one, so the
          cell never collapses to nothing while you are mid-number. */}
      <button
        type="button"
        role="radio"
        aria-checked={typed}
        onClick={onPickCustom}
        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border p-2 ${
          typed
            ? "border-accent bg-accent/10"
            : "border-line hover:bg-surface-2"
        }`}
      >
        <span
          aria-hidden="true"
          className="flex items-end justify-center"
          style={{ height: `${PREVIEW_BOX.height}px` }}
        >
          <span
            className={`block rounded-[2px] border border-dashed ${
              typed ? "border-accent bg-accent/20" : "border-muted bg-surface-2"
            }`}
            style={{
              width: `${Math.max(6, Math.round((custom ?? CUSTOM_CANVAS).width * scale))}px`,
              height: `${Math.max(6, Math.round((custom ?? CUSTOM_CANVAS).height * scale))}px`,
            }}
          />
        </span>
        <span
          className={`text-xs whitespace-nowrap ${
            typed ? "text-accent" : "text-fg-bright"
          }`}
        >
          {t("newDrawing.custom")}
        </span>
        <span className="text-[10px] whitespace-nowrap text-muted tabular-nums">
          {custom ? dimensions(custom) : t("newDrawing.customEmpty")}
        </span>
      </button>
    </div>
  );
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
