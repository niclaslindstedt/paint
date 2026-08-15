// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Marks on the system clipboard.
//
// Copying a selection has to end up somewhere the paste can find it, and the
// obvious somewhere — a variable in the app — is the one that fails the moment
// you copy in one tab and paste in another, or copy, reload, and paste. So a
// copied selection goes onto the **real** clipboard, as text, behind a marker
// this app recognises:
//
//   paint/strokes:{"v":1,"strokes":[…]}
//
// Text, because that is the one clipboard flavour every browser will let a page
// write from a `copy` event without asking anyone's permission, and because it
// costs nothing: a paste that isn't ours simply doesn't start with the marker
// and is read as the words (or the picture) it actually is.
//
// The trade is that a copied selection is *visible* if you paste it into a text
// editor. That is a fair price for "copy here, paste there" working at all, and
// it is what every vector app that survives a reload does.
//
// Everything here is pure and has no clipboard API in it: the events do the
// reading and writing (see `CanvasScreen.tsx`), and this is only the format.

import type { DraftStroke } from "./plugins/types.ts";
import type { Gradient, Shape, Stroke } from "./types.ts";

/** What marks the payload as ours. Fixed for good — an older build's clipboard
 *  text has to keep pasting into a newer one. */
export const STROKE_CLIP_PREFIX = "paint/strokes:";

/** The payload's own version, for the day the shape of a stroke changes in a
 *  way a paste can't absorb. Nothing reads it yet beyond refusing what it
 *  doesn't know, which is exactly what it is for. */
const CLIP_VERSION = 1;

/** Put a run of marks on the clipboard, as the text this app writes.
 *
 *  Ids are dropped: a pasted mark is a **new** mark, and carrying the original's
 *  id would let one paste collide with the stroke it was copied from. Layers go
 *  with them, for the same reason a paste lands on the layer you are drawing on
 *  rather than one that may not exist on this page. */
export function encodeStrokes(strokes: readonly Stroke[]): string {
  const payload = {
    v: CLIP_VERSION,
    strokes: strokes.map(({ id: _id, layer: _layer, ...rest }) => rest),
  };
  return `${STROKE_CLIP_PREFIX}${JSON.stringify(payload)}`;
}

/** Whether some clipboard text is a run of marks this app wrote. Cheap enough
 *  to ask before parsing, which is what the paste handler does to decide whether
 *  it is looking at marks or at words someone copied out of a browser. */
export function isStrokeClip(text: string): boolean {
  return text.startsWith(STROKE_CLIP_PREFIX);
}

/** Read marks back off the clipboard, or `null` for text that isn't ours — or
 *  that is ours and unreadable.
 *
 *  Everything is checked, because everything here came off a *system* clipboard:
 *  another app can put anything at all behind our marker, and a half-copied
 *  string is a paste away from a drawing that won't render. Anything that
 *  doesn't survive the check is dropped rather than repaired; a paste that
 *  quietly does nothing beats a page of broken marks. */
export function decodeStrokes(text: string): DraftStroke[] | null {
  if (!isStrokeClip(text)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(STROKE_CLIP_PREFIX.length));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const payload = parsed as { v?: unknown; strokes?: unknown };
  if (payload.v !== CLIP_VERSION) return null;
  if (!Array.isArray(payload.strokes)) return null;
  const strokes = payload.strokes
    .map(readStroke)
    .filter((s): s is DraftStroke => s !== null);
  return strokes.length > 0 ? strokes : null;
}

/** One mark off the clipboard, or `null` when it isn't one. */
function readStroke(raw: unknown): DraftStroke | null {
  if (typeof raw !== "object" || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (typeof s.tool !== "string" || !s.tool) return null;
  if (typeof s.size !== "number" || !Number.isFinite(s.size) || s.size <= 0) {
    return null;
  }
  const shape = readShape(s.shape);
  if (!shape) return null;
  return {
    tool: s.tool,
    size: s.size,
    ...(typeof s.color === "string" ? { color: s.color } : {}),
    ...(typeof s.opacity === "number" ? { opacity: s.opacity } : {}),
    ...(typeof s.hardness === "number" ? { hardness: s.hardness } : {}),
    ...(s.filled === true ? { filled: true } : {}),
    ...(readDials(s.dials) ?? {}),
    shape,
  };
}

/** A mark's tuning, kept only when it is a map of finite numbers. */
function readDials(raw: unknown): { dials: Record<string, number> } | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;
  const dials: Record<string, number> = {};
  for (const [id, at] of Object.entries(raw)) {
    if (typeof at === "number" && Number.isFinite(at)) dials[id] = at;
  }
  return Object.keys(dials).length > 0 ? { dials } : null;
}

/** A point, or `null` for anything that isn't one. */
function readPoint(raw: unknown): { x: number; y: number } | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as { x?: unknown; y?: unknown };
  if (typeof p.x !== "number" || !Number.isFinite(p.x)) return null;
  if (typeof p.y !== "number" || !Number.isFinite(p.y)) return null;
  return { x: p.x, y: p.y };
}

function readPoints(raw: unknown): { x: number; y: number }[] | null {
  if (!Array.isArray(raw)) return null;
  const points = raw.map(readPoint);
  return points.every((p) => p !== null)
    ? (points as { x: number; y: number }[])
    : null;
}

/** The ramp a poured area is inked with, or `null` when there isn't one — which
 *  is every fill the bucket made, and any copy whose ramp didn't survive the
 *  trip. A region with no ramp is a flat fill, so dropping a broken one loses
 *  the colours and keeps the mark; refusing the whole stroke would lose both. */
function readGradient(raw: unknown): Gradient | null {
  if (typeof raw !== "object" || raw === null) return null;
  const g = raw as { from?: unknown; to?: unknown; stops?: unknown };
  const from = readPoint(g.from);
  const to = readPoint(g.to);
  if (!from || !to || !Array.isArray(g.stops)) return null;
  const stops: Gradient["stops"] = [];
  for (const raw of g.stops) {
    if (typeof raw !== "object" || raw === null) return null;
    const stop = raw as { at?: unknown; color?: unknown };
    if (typeof stop.at !== "number" || !Number.isFinite(stop.at)) return null;
    if (typeof stop.color !== "string" || !stop.color) return null;
    stops.push({ at: stop.at, color: stop.color });
  }
  return stops.length > 0 ? { from, to, stops } : null;
}

/** The geometry half of a mark. Switches on the kind, exactly as every other
 *  reader of a shape in this app does — a shape kind this build doesn't ship
 *  simply doesn't paste. */
function readShape(raw: unknown): Shape | null {
  if (typeof raw !== "object" || raw === null) return null;
  const shape = raw as Record<string, unknown>;
  switch (shape.kind) {
    case "path": {
      const points = readPoints(shape.points);
      return points && points.length > 0 ? { kind: "path", points } : null;
    }
    case "segment":
    case "box":
    case "image": {
      const from = readPoint(shape.from);
      const to = readPoint(shape.to);
      if (!from || !to) return null;
      if (shape.kind === "image") {
        // Only an inlined bitmap travels: `srcPath` names a file beside a
        // *particular* backend's document (see `imageStore.ts`), and a paste
        // into another sketchbook would point at nothing. How it is sampled
        // does travel — a piece of pixel art pasted somewhere else is still
        // pixel art, and losing that is losing the picture.
        return typeof shape.src === "string"
          ? {
              kind: "image",
              from,
              to,
              src: shape.src,
              ...(shape.smoothing === "nearest"
                ? { smoothing: "nearest" as const }
                : {}),
            }
          : null;
      }
      return { kind: shape.kind, from, to };
    }
    case "region": {
      if (!Array.isArray(shape.contours)) return null;
      const contours = shape.contours.map(readPoints);
      if (contours.some((c) => c === null)) return null;
      const gradient = readGradient(shape.gradient);
      return {
        kind: "region",
        contours: contours as { x: number; y: number }[][],
        ...(gradient ? { gradient } : {}),
      };
    }
    case "text": {
      const at = readPoint(shape.at);
      if (!at || typeof shape.text !== "string") return null;
      return {
        kind: "text",
        at,
        text: shape.text,
        ...(typeof shape.font === "string" ? { font: shape.font } : {}),
        ...(shape.bold === true ? { bold: true } : {}),
        ...(shape.italic === true ? { italic: true } : {}),
      };
    }
    default:
      return null;
  }
}
