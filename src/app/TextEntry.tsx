// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useLayoutEffect, useRef } from "react";

import {
  CheckIcon,
  CloseIcon,
} from "@niclaslindstedt/oss-framework/components";

import { BoldIcon, ItalicIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import {
  fontSpec,
  measureText,
  TEXT_FONTS,
  TEXT_LINE_HEIGHT,
  TEXT_WIDE_CHAR,
} from "./plugins/builtin/text.ts";
import type { Point } from "./types.ts";
import { toScreenPoint, type CanvasView } from "./viewport.ts";

// The caret the text tool opens, and the bar of type controls over it.
//
// Typing is the one mark this app can't take from a pointer, so the text tool
// doesn't try: a press opens a real `<textarea>` sitting exactly where the
// caption will land, set in the face, size and colour it will land in, and the
// words become a stroke when you are done with them. What you are typing into is
// a preview of the mark — same font, same size, same ink, same place — so there
// is no "now render it" beat between the two.
//
// A DOM element rather than something painted on the canvas, for the same reason
// the image placement frame is one: a caret, a selection, an IME, a phone's
// autocorrect and a keyboard that pushes the viewport up are all things the
// platform already does, and none of them can be reimplemented on a `<canvas>`
// worth having.
//
// **Enter is a newline, not a commit.** A caption is often two lines, and a text
// box that files itself the moment you reach the end of the first one is a text
// box you fight. Escape throws the words away, ⌘/Ctrl+Enter and the tick keep
// them, and so does pressing anywhere else on the page — the same "click outside
// it" rule the placement frame follows.

type Props = {
  /** The window onto the page, so the box sits exactly where the words will. */
  view: CanvasView;
  /** Where the caption is anchored, in document coordinates — its top-left. */
  at: Point;
  value: string;
  onChange: (value: string) => void;
  /** The ink the caption will be set in: what the box previews. */
  ink: {
    color: string;
    size: number;
    font: string;
    bold: boolean;
    italic: boolean;
    opacity: number;
  };
  onFontChange: (font: string) => void;
  onBoldChange: (bold: boolean) => void;
  onItalicChange: (italic: boolean) => void;
  /** File the words as a mark on the page. */
  onCommit: () => void;
  /** Throw them away and leave the document as it was. */
  onCancel: () => void;
};

/** How wide the box opens, in characters — enough to type a caption into
 *  without it growing on the second word, and it grows past this anyway. */
const MIN_CHARS = 12;

export function TextEntry({
  view,
  at,
  value,
  onChange,
  ink,
  onFontChange,
  onBoldChange,
  onItalicChange,
  onCommit,
  onCancel,
}: Props) {
  const t = useT();
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  // The caret goes where the press was, without a second tap to get it there.
  useEffect(() => {
    fieldRef.current?.focus();
  }, []);

  // The two keys, watched on the window rather than on the field: the type bar
  // is part of this box, and pressing Escape after reaching up to it should
  // still throw the caption away. Plain Enter is deliberately not here — inside
  // the field it breaks the line, which is what a caption needs.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onCommit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCommit, onCancel]);

  // Grow with the words — height by the lines actually there, width by the
  // longest one — so the box stays the size of the mark rather than a fixed
  // rectangle the caption spills out of.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
  }, [value, ink.size, ink.font, ink.bold, view.scale]);

  const screen = toScreenPoint(view, at);
  // The box is drawn at the *view's* scale, so the words in it are the size they
  // will be on the page — zoomed out, you type small type.
  const size = ink.size * view.scale;
  const spec = fontSpec({
    size,
    font: ink.font,
    bold: ink.bold,
    italic: ink.italic,
  });
  // As wide as the longest line, plus room for the caret past the last glyph.
  const width = Math.ceil(
    Math.max(
      MIN_CHARS * size * TEXT_WIDE_CHAR,
      ...value.split("\n").map((line) => measureText(line, spec)),
    ) +
      size * 0.6,
  );

  return (
    <div
      className="absolute inset-0 z-20"
      // The layer swallows presses meant for the page: one anywhere outside the
      // box keeps the caption, which is how a caption is normally finished.
      onPointerDown={onCommit}
    >
      <div
        className="absolute"
        style={{ left: `${screen.x}px`, top: `${screen.y}px` }}
        // …but not presses on the box itself, or typing would end on the first
        // attempt to put the caret somewhere.
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* The type bar: the face, the weight, the slant, and the two ways out.
            It sits *above* the caret, out of the way of the words being typed,
            and it is the only place these three are offered — they mean nothing
            when nothing is being typed. */}
        <div className="absolute bottom-full left-0 mb-2 flex w-max items-center gap-1 rounded-md border border-line bg-surface p-1 shadow-lg">
          <div
            className="flex items-center gap-0.5"
            role="group"
            aria-label={t("text.font")}
          >
            {TEXT_FONTS.map((face) => (
              <button
                key={face.id}
                type="button"
                // The bar never takes the caret: pressing a face is a change to
                // what you are typing, not a change of what you are typing in.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onFontChange(face.id)}
                aria-pressed={face.id === ink.font}
                title={face.label}
                // Each face is set in itself: the sample is the label, which is
                // the one way of naming a typeface that needs no translating.
                style={{ fontFamily: face.stack }}
                className={`h-7 cursor-pointer rounded border px-2 text-sm ${
                  face.id === ink.font
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-transparent text-fg hover:border-line hover:bg-surface-2"
                }`}
              >
                {face.label}
              </button>
            ))}
          </div>

          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />

          <StyleToggle
            label={t("text.bold")}
            pressed={ink.bold}
            onClick={() => onBoldChange(!ink.bold)}
          >
            <BoldIcon className="h-[18px] w-[18px]" />
          </StyleToggle>
          <StyleToggle
            label={t("text.italic")}
            pressed={ink.italic}
            onClick={() => onItalicChange(!ink.italic)}
          >
            <ItalicIcon className="h-[18px] w-[18px]" />
          </StyleToggle>

          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />

          <StyleToggle label={t("text.discard")} onClick={onCancel}>
            <CloseIcon className="h-[18px] w-[18px]" />
          </StyleToggle>
          <StyleToggle label={t("text.keep")} onClick={onCommit}>
            <CheckIcon className="h-[18px] w-[18px] text-accent" />
          </StyleToggle>
        </div>

        <textarea
          ref={fieldRef}
          value={value}
          rows={1}
          onChange={(e) => onChange(e.currentTarget.value)}
          aria-label={t("text.field")}
          placeholder={t("text.placeholder")}
          spellcheck={false}
          // No soft wrapping: the painter puts a line where you typed one and
          // nowhere else, so the preview must not invent breaks of its own.
          wrap="off"
          className="block resize-none overflow-hidden rounded-[3px] border border-dashed border-accent/70 bg-transparent p-0 outline-none"
          style={{
            font: spec,
            lineHeight: String(TEXT_LINE_HEIGHT),
            color: ink.color,
            opacity: ink.opacity,
            width: `${width}px`,
            // The caret is where the words start, and the words start at the
            // point that was pressed — no padding to push them off it.
            caretColor: ink.color,
          }}
        />
      </div>
    </div>
  );
}

/** One square button on the type bar. `pressed` makes it a toggle; without it
 *  the button is an action (keep, discard). */
function StyleToggle({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // Same as the faces above: the field keeps the caret through a press.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={`inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border ${
        pressed
          ? "border-accent bg-accent/15 text-accent"
          : "border-transparent text-fg hover:border-line hover:bg-surface-2"
      }`}
    >
      {children}
    </button>
  );
}
