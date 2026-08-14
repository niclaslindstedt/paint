// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import {
  Button,
  ImageUpIcon,
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
  previewScale,
  type CanvasPreset,
  type CanvasSize,
} from "./canvasSize.ts";
import { clipboardImage } from "./clipboard.ts";
import { useT } from "./i18n/index.ts";
import {
  imageFileStem,
  importImageFile,
  type ImportedImage,
} from "./images.ts";
import * as output from "../output.ts";

// Where a drawing comes from — the one dialog between pressing New and having a
// page in front of you.
//
// It asks two questions, in that order. **What is this drawing made of**: an
// empty page, a picture from disk, or whatever is on the clipboard. And, for an
// empty one, **how big is it** — asked once, here, because a page never reflows
// (see `types.ts`), so the size is part of creating the thing rather than a
// setting to find afterwards. A drawing made *from a picture* asks neither: it
// is the size of the picture, which is the only answer that isn't a crop.
//
// The three sources are a segmented control rather than three buttons because
// they are the same act — start a drawing — from three places, and only one of
// them can be true at a time. Clipboard shows up only when there is actually a
// picture on it; a tab that is always there and usually says "nothing here" is a
// tab that teaches you to skip it (see `clipboard.ts` for why that question is
// harder to ask than it sounds).
//
// **The sizes are drawn, not listed.** Four rectangles at one shared scale
// answer "how much bigger is 4K than Full HD" and "is A4 taller than my screen"
// in the way a dropdown of numbers never did — the choice is a comparison, so
// the control is one too. Four is the whole list on purpose: past that the shelf
// stops being comparable and starts being a catalogue.

/** Which of the three the dialog is showing. */
type Source = "blank" | "file" | "clipboard";

type Props = {
  /** The folder the drawing will be filed into, named for the title — so
   *  "New drawing in Diagrams" says where it is about to land. */
  folderName?: string;
  onCancel: () => void;
  /** Make an empty page of this size. */
  onCreate: (size: CanvasSize) => void;
  /** Make a page from a picture: cut to its size, named for where it came
   *  from. */
  onCreateFromImage: (image: ImportedImage, name: string) => void;
};

/** The box each preset is drawn inside, in CSS pixels. One scale is shared
 *  across the shelf, so this is the room the *largest* of them gets. */
const PREVIEW_BOX = { width: 104, height: 74 };

export function NewDrawingModal({
  folderName,
  onCancel,
  onCreate,
  onCreateFromImage,
}: Props) {
  const t = useT();
  // The screen is read once, when the dialog opens: it is the default answer,
  // and it can't change while the dialog is in front of you.
  const [presets] = useState(() => canvasPresets(currentScreenCanvasSize()));
  const [source, setSource] = useState<Source>("blank");
  const [size, setSize] = useState<CanvasSize>(
    () => presets[0]?.size ?? { width: 1920, height: 1080 },
  );
  // A picture chosen from disk, waiting for Create.
  const [picked, setPicked] = useState<{
    image: ImportedImage;
    name: string;
  } | null>(null);
  // What is on the clipboard: undefined while we are still asking, null once we
  // know there is nothing we can use.
  const [pasted, setPasted] = useState<ImportedImage | null | undefined>(
    undefined,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Ask the clipboard once, as the dialog opens. Every failure is "nothing
  // there" (see `clipboard.ts`), so this can never leave the dialog stuck.
  useEffect(() => {
    let live = true;
    void clipboardImage().then((image) => {
      if (live) setPasted(image);
    });
    return () => {
      live = false;
    };
  }, []);

  const take = (file: File | null | undefined) => {
    if (!file) return;
    void importImageFile(file)
      .then((image) => {
        setPicked({ image, name: imageFileStem(file.name) });
        setSource("file");
      })
      .catch((err: unknown) =>
        output.error(
          `Couldn't read that image — ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  };

  // A picture dropped on the dialog is a picture chosen — the same gesture the
  // canvas and the drawer already take, landing in the same place.
  const { active: dragging } = useFileDrop({
    targetRef: bodyRef,
    accepts: (dt) => dragHasFilesOfType(dt, "image/"),
    claim: true,
    onDrop: (files) => take(firstFileOfType(files, "image/")),
  });

  const chosen = source === "file" ? picked?.image : undefined;
  const ready =
    source === "blank" ||
    (source === "file" && picked) ||
    (source === "clipboard" && pasted);

  const create = () => {
    if (source === "blank") onCreate(size);
    else if (source === "file" && picked) {
      onCreateFromImage(picked.image, picked.name);
    } else if (source === "clipboard" && pasted) {
      onCreateFromImage(pasted, t("newDrawing.clipboardName"));
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
      size="max-w-lg"
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
            // Offered only when the clipboard actually holds a picture — while
            // we are still asking it is there but disabled, which is a second
            // of a dimmed tab rather than a tab that appears under your thumb.
            ...(pasted !== null
              ? [
                  {
                    value: "clipboard" as const,
                    label: t("newDrawing.sourceClipboard"),
                    disabled: pasted === undefined,
                  },
                ]
              : []),
          ]}
        />

        {source === "blank" && (
          <SizeShelf
            presets={presets}
            value={size}
            onPick={setSize}
            dimensions={dimensions}
          />
        )}

        {source === "file" && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line px-4 py-6 text-sm text-muted hover:border-accent hover:text-fg-bright"
            >
              {chosen ? (
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
              {chosen ? dimensions(chosen) : t("newDrawing.chooseImageHint")}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
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
            <div className="flex items-center justify-center rounded-lg border border-line px-4 py-4">
              {pasted ? (
                <img
                  src={pasted.src}
                  alt=""
                  className="max-h-32 max-w-full rounded object-contain"
                />
              ) : (
                <SpinnerIcon className="h-5 w-5 text-muted" />
              )}
            </div>
            {pasted && (
              <p className="text-xs text-muted tabular-nums">
                {dimensions(pasted)}
              </p>
            )}
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

/** The four page sizes, drawn to one shared scale so they can be compared
 *  rather than read. */
function SizeShelf({
  presets,
  value,
  onPick,
  dimensions,
}: {
  presets: readonly CanvasPreset[];
  value: CanvasSize;
  onPick: (size: CanvasSize) => void;
  dimensions: (size: CanvasSize) => string;
}) {
  const t = useT();
  const scale = previewScale(presets, PREVIEW_BOX);
  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      role="radiogroup"
      aria-label={t("newDrawing.sizeLabel")}
    >
      {presets.map((preset) => {
        const active =
          preset.size.width === value.width &&
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
    </div>
  );
}
