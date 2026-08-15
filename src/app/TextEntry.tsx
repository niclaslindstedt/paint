// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  CheckIcon,
  CloseIcon,
  GripIcon,
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
import { toDocumentPoint, toScreenPoint, type CanvasView } from "./viewport.ts";

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
//
// **The box moves.** A caption almost never lands where the first tap put it,
// and the answer used to be: throw it away and type it again somewhere else.
// Now the box can be dragged, the way the dropped-image frame already could.
// What is draggable is the box's *rim* and the grip at the head of the type bar
// — deliberately not the middle of the field, because the middle of a text field
// is where a phone puts the caret and the selection handles, and a drag that
// stole those would cost more than it gave.
//
// **And it stays on screen.** The box grows to the right as you type, so a
// caption started near the right-hand edge used to run off it, taking the type
// bar's buttons with it — including the only tick a phone has, since there is no
// ⌘+Enter to reach for. Two rules fix that without lying about where the mark
// will land: the field is capped at the room actually left (the browser scrolls
// it to follow the caret, so the words you are typing stay visible), and the
// bar, which is chrome rather than a preview, is slid back inside the canvas and
// flipped below the box when there is no room above it.

type Props = {
  /** The window onto the page, so the box sits exactly where the words will. */
  view: CanvasView;
  /** Where the caption is anchored, in document coordinates — its top-left. */
  at: Point;
  value: string;
  onChange: (value: string) => void;
  /** Put the caption somewhere else, in document coordinates — what dragging
   *  the box sends. */
  onMove: (at: Point) => void;
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

/** How much of the canvas is kept clear around the box and its bar, in screen
 *  pixels. Enough that a clamped bar doesn't sit flush against the edge. */
const GUTTER = 8;

/** How narrow the field is allowed to get when the caret lands right against
 *  the edge of the canvas.
 *
 *  Deliberately tiny. A wider floor reads better right up until the press that
 *  lands twenty pixels from the edge, and then it is a box hanging off the
 *  screen again — which is the thing this is here to stop. A box this narrow is
 *  awkward, but the words scroll through it, the bar above it is reachable, and
 *  the caption can be dragged somewhere sensible. */
const MIN_FIELD = 24;

/** A drag of the whole box: the pointer that owns it, where it started, and the
 *  anchor it started from. Computed from the start rather than accumulated per
 *  frame, so a drag is exact and reversible. */
type Drag = { pointerId: number; from: Point; at: Point };

export function TextEntry({
  view,
  at,
  value,
  onChange,
  onMove,
  ink,
  onFontChange,
  onBoldChange,
  onItalicChange,
  onCommit,
  onCancel,
}: Props) {
  const t = useT();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // What the layer and the bar actually measure, so the clamping below is
  // arithmetic on real numbers rather than a guess at how wide a row of type
  // buttons comes out in the user's language.
  const [room, setRoom] = useState({ width: 0, height: 0 });
  const [bar, setBar] = useState({ width: 0, height: 0 });

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

  // Grow with the words — height by the lines actually there — so the box stays
  // the size of the mark rather than a fixed rectangle the caption spills out
  // of. The *width* is capped by the room left (below), and the browser scrolls
  // the field sideways to keep the caret in view once it hits that cap.
  useLayoutEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.style.height = "0px";
    field.style.height = `${field.scrollHeight}px`;
  }, [value, ink.size, ink.font, ink.bold, view.scale]);

  // Measured every render, because everything that moves the box — a keystroke
  // widening it, a pan, a typeface with wider buttons, the window resizing —
  // changes what has to be clamped, and a dependency list naming all of them
  // would be a list of everything. Written back only when it actually differs,
  // which is what stops the update chain the rule below is warning about.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (layer) {
      const next = { width: layer.clientWidth, height: layer.clientHeight };
      setRoom((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    }
    const chrome = barRef.current;
    if (chrome) {
      const next = { width: chrome.offsetWidth, height: chrome.offsetHeight };
      setBar((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next,
      );
    }
  });

  /** A pointer event in document coordinates — the space the anchor lives in,
   *  at any zoom. */
  const documentPoint = (e: { clientX: number; clientY: number }): Point => {
    const rect = layerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return toDocumentPoint(view, {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const startDrag = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { pointerId: e.pointerId, from: documentPoint(e), at };
  };

  const continueDrag = (e: React.PointerEvent<HTMLElement>) => {
    const active = drag.current;
    if (!active || active.pointerId !== e.pointerId) return;
    e.preventDefault();
    const now = documentPoint(e);
    onMove({
      x: active.at.x + (now.x - active.from.x),
      y: active.at.y + (now.y - active.from.y),
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId === e.pointerId) drag.current = null;
  };

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
  // As wide as the longest line, plus room for the caret past the last glyph…
  const wanted = Math.ceil(
    Math.max(
      MIN_CHARS * size * TEXT_WIDE_CHAR,
      ...value.split("\n").map((line) => measureText(line, spec)),
    ) +
      size * 0.6,
  );
  // …but never wider than what is left of the canvas to the right of it.
  const width = room.width
    ? Math.max(MIN_FIELD, Math.min(wanted, room.width - screen.x - GUTTER))
    : wanted;

  // The bar is chrome, so it may sit somewhere the caption does not: slid left
  // when it would run off the right-hand edge, and dropped below the box when
  // there is no room for it above. Both are no-ops in the ordinary case.
  const overhang = room.width
    ? Math.min(0, room.width - GUTTER - (screen.x + bar.width))
    : 0;
  const barShift = Math.max(overhang, GUTTER - screen.x);
  const barAbove = !bar.height || screen.y - bar.height - GUTTER >= 0;

  return (
    <div
      ref={layerRef}
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
        {/* The type bar: a grip, the face, the weight, the slant, and the two
            ways out. It sits above the caret, out of the way of the words being
            typed, and it is the only place these are offered — they mean
            nothing when nothing is being typed. */}
        <div
          ref={barRef}
          className={`absolute flex w-max items-center gap-1 rounded-md border border-line bg-surface p-1 shadow-lg ${
            barAbove ? "bottom-full mb-2" : "top-full mt-2"
          }`}
          style={{ left: `${barShift}px` }}
        >
          {/* The handle. The rim of the box drags too, but a rim is a few
              pixels wide and this is a thumb-sized target that says outright
              that the caption can be moved. */}
          <button
            type="button"
            aria-label={t("text.move")}
            title={t("text.move")}
            className="inline-flex h-7 w-7 cursor-move touch-none items-center justify-center rounded border border-transparent text-muted hover:border-line hover:bg-surface-2 hover:text-fg"
            onPointerDown={startDrag}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <GripIcon className="h-[18px] w-[18px]" />
          </button>

          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-line" />

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

        {/* The frame the dashed outline now lives on, so there is a rim to
            take hold of. It pads by exactly as much as it is pulled back by
            (a 1px border and 4px of padding, against a −5px margin), because
            the words have to start on the point that was pressed — that is
            where the mark lands. The frame stays in flow, so the type bar's
            `bottom-full` / `top-full` still measure against the box. */}
        <div
          role="group"
          aria-label={t("text.field")}
          className="-m-[5px] cursor-move touch-none rounded-[3px] border border-dashed border-accent/70 p-1"
          onPointerDown={(e) => {
            // Only the rim: a press on the field itself is someone placing the
            // caret, and stealing it would make the box untypeable.
            if (e.target !== e.currentTarget) return;
            startDrag(e);
          }}
          onPointerMove={continueDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
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
            className="block cursor-text resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
            style={{
              font: spec,
              lineHeight: String(TEXT_LINE_HEIGHT),
              color: ink.color,
              opacity: ink.opacity,
              width: `${width}px`,
              // The frame around this one refuses touch gestures so its rim can
              // be dragged; the field itself has to hand them back, or a phone
              // loses the scroll, the selection handles and the magnifier.
              touchAction: "auto",
              // The caret is where the words start, and the words start at the
              // point that was pressed — no padding to push them off it.
              caretColor: ink.color,
            }}
          />
        </div>
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
