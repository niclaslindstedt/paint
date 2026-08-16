// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_NAMESPACE_SLUG } from "@niclaslindstedt/oss-framework/namespaces";

import { pageFitting, strokeBounds, unionBox, type Box } from "./bounds.ts";
import {
  handOffDrawing,
  handOffFolder,
  type Handoff,
  type Mint,
} from "./handoff.ts";
import {
  activeLayer,
  activeLayerId,
  canDeleteLayer,
  canMoveLayerTo,
  drawableLayer,
  drawingLayers,
  isLocked,
  reorderLayers,
  strokesExcept,
} from "./layers.ts";
import { turnBitmap } from "./images.ts";
import { parseDoc, serializeDoc } from "./migrations.ts";
import { translateStroke } from "./selection.ts";
import type { BitmapTurn, PageEdit } from "./transform.ts";
import {
  DEFAULT_CANVAS,
  liveDrawings,
  nextActiveId,
  type AppData,
  type Drawing,
  type Folder,
  type Layer,
  type Stroke,
} from "./types.ts";
import type { DraftStroke } from "./plugins/types.ts";
import * as output from "../output.ts";

// The app's data store. Holds one namespace's document in state, persists it to
// a per-namespace localStorage key, and exposes the edit actions the screens
// drive — adding strokes, adding / renaming / clearing drawings, switching the
// active page — over an undo / redo history. This is the framework's "store
// stays in the app" seam: the framework owns storage adapters, namespaces, and
// the UI kit; this hook owns where each namespace's document lives and how
// edits stack up.
//
// Every mark is one undo step. That is the whole reason the document is vector:
// undo is `pop()`, not a bitmap snapshot per stroke.

const DOC_KEY_PREFIX = "paint:doc";

/** localStorage key for a namespace's document. The default namespace keeps the
 *  un-suffixed key; every other namespace gets a per-slug suffix. */
export function docKey(slug: string): string {
  return slug === DEFAULT_NAMESPACE_SLUG
    ? DOC_KEY_PREFIX
    : `${DOC_KEY_PREFIX}:${slug}`;
}

/** Mint a unique id for a drawing or a stroke. A random suffix makes the id
 *  unique across sessions (and namespaces), so it can never collide with one
 *  already on disk; the prefix keeps ids legible while debugging. */
export function freshId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/** A blank page. It pins no background, so it follows the canvas theme until
 *  someone chooses a colour for it (see `canvas.ts`). */
export function blankDrawing(
  name: string,
  folderId: string | null = null,
): Drawing {
  return {
    id: freshId("drawing"),
    name,
    width: DEFAULT_CANVAS.width,
    height: DEFAULT_CANVAS.height,
    strokes: [],
    ...(folderId ? { folderId } : {}),
    createdAt: new Date().toISOString(),
  };
}

/** The document a first-run app opens on: one empty page, ready to draw. */
export function starterDoc(): AppData {
  const first = blankDrawing("");
  return { folders: [], drawings: [first], activeDrawingId: first.id };
}

/** The document storage seam. The store never touches `localStorage` directly —
 *  it reads and writes a namespace's document through a `DocBackend`, so a
 *  different backend can take over storage without the store changing. */
export type DocBackend = {
  readonly id: "local" | "memory";
  /** The namespace's current document, or a starter document when empty. */
  load(slug: string): AppData;
  /** Persist a namespace's document. A best-effort sink — it must not throw. */
  save(slug: string, doc: AppData): void;
};

/** The real backend: one JSON document per namespace in localStorage, run
 *  through the migration pipeline on the way in and out.
 *
 *  Both directions are *non-destructive*. A document that exists but this build
 *  can't read — most often one a NEWER build already upgraded, then read by a
 *  stale (service-worker-cached) build after an app update — is left on disk
 *  untouched rather than silently replaced with a blank starter, so it comes
 *  back on its own once the update finishes. */
export const localDocBackend: DocBackend = {
  id: "local",
  load(slug) {
    let raw: string | null;
    try {
      raw = localStorage.getItem(docKey(slug));
    } catch {
      // Storage unavailable — nothing to read; boot a fresh document.
      return starterDoc();
    }
    if (!raw) return starterDoc();
    try {
      return parseDoc(raw);
    } catch (err) {
      // Bytes exist but can't be parsed / migrated (corrupt, or written by a
      // newer build). Keep the original on disk — the caller must NOT persist
      // the starter we return here over it (see the store's persist guard) —
      // and quarantine a copy so it stays recoverable.
      output.error(
        `Couldn't read the drawings saved on this device — ${
          err instanceof Error ? err.message : String(err)
        }. The stored copy is left untouched and should reappear once the app finishes updating.`,
      );
      try {
        localStorage.setItem(`${docKey(slug)}:unreadable`, raw);
      } catch {
        // No room to quarantine — the live key is still left intact.
      }
      return starterDoc();
    }
  },
  save(slug, doc) {
    try {
      localStorage.setItem(docKey(slug), serializeDoc(doc));
    } catch {
      output.error(
        "Couldn't save the drawing to this device's storage (it may be full). Your work stays in memory and in any connected cloud copy.",
      );
    }
  },
};

/** The constructors the hand-off module needs to mint arriving copies and to
 *  leave a page behind when the last live one is given away. */
const MINT: Mint = { id: freshId, blankPage: () => blankDrawing("") };

/** Apply `patch` to the drawings named by `ids`, stamping `updatedAt` on each.
 *  The one funnel the archive / restore / file-into-folder actions share, so a
 *  bulk edit (archiving a folder takes its drawings with it) is one map rather
 *  than one per call site. */
function patchDrawings(
  drawings: Drawing[],
  ids: ReadonlySet<string>,
  patch: Partial<Drawing>,
): Drawing[] {
  const stamp = new Date().toISOString();
  return drawings.map((d) =>
    ids.has(d.id) ? { ...d, ...patch, updatedAt: stamp } : d,
  );
}

export type PaintStore = ReturnType<typeof usePaintStore>;

export function usePaintStore(
  slug: string,
  backend: DocBackend = localDocBackend,
) {
  // The active slug and the backend travel *with* the document in state, so the
  // persist effect can never write one namespace's data under another's key.
  const [state, setState] = useState(() => ({
    slug,
    backend,
    data: backend.load(slug),
  }));
  // Edit history. `setActive` replaces the present without pushing, so
  // navigation never clutters undo; every content edit goes through `commit`.
  const past = useRef<AppData[]>([]);
  const future = useRef<AppData[]>([]);
  const [version, setVersion] = useState(0); // re-render on history change

  // Guards the write-through below: only a real change (an edit, an adopt) may
  // persist. State produced by *loading* a document — the initial mount, a
  // namespace switch, a reload — must NOT be written back, so a blank starter
  // that `load` returned because the stored bytes were momentarily unreadable
  // can never overwrite the real (still-on-disk) copy.
  const persistPending = useRef(false);
  const markPersist = useCallback(() => {
    persistPending.current = true;
  }, []);

  // Namespace switch — or a backend swap — adopts the matching document and
  // resets history. Adjusting state during render (rather than in an effect) is
  // React's blessed way to respond to a changed input with no stale-doc flash.
  if (state.slug !== slug || state.backend !== backend) {
    past.current = [];
    future.current = [];
    setState({ slug, backend, data: backend.load(slug) });
  }

  const data = state.data;

  useEffect(() => {
    if (!persistPending.current) return;
    persistPending.current = false;
    state.backend.save(state.slug, state.data);
  }, [state]);

  const commit = useCallback(
    (next: AppData) => {
      markPersist();
      setState((prev) => {
        past.current.push(prev.data);
        future.current = [];
        return { ...prev, data: next };
      });
      setVersion((v) => v + 1);
    },
    [markPersist],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    markPersist();
    setState((cur) => {
      future.current.push(cur.data);
      return { ...cur, data: prev };
    });
    setVersion((v) => v + 1);
  }, [markPersist]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    markPersist();
    setState((cur) => {
      past.current.push(cur.data);
      return { ...cur, data: next };
    });
    setVersion((v) => v + 1);
  }, [markPersist]);

  /** Re-read the persisted document, picking up edits made in another tab.
   *  Replaces the present without touching the undo history (a refresh isn't an
   *  edit you'd undo) and never marks the state to persist — writing it straight
   *  back would defeat the non-destructive load guard. */
  const reload = useCallback(() => {
    setState((cur) => ({ ...cur, data: cur.backend.load(cur.slug) }));
    setVersion((v) => v + 1);
  }, []);

  /** Adopt a document that arrived from a sync backend: make it the present and
   *  persist it under the active namespace's key. History is cleared — the
   *  remote copy is a new baseline, not an edit. Bumps the version counter by
   *  exactly one (the sync engine relies on that to re-baseline `dirty`). */
  const adoptRemote = useCallback(
    (text: string) => {
      let doc: AppData;
      try {
        doc = parseDoc(text);
      } catch {
        return; // Unparseable remote bytes — keep the local document.
      }
      markPersist();
      setState((cur) => {
        past.current = [];
        future.current = [];
        return { ...cur, data: doc };
      });
      setVersion((v) => v + 1);
    },
    [markPersist],
  );

  // The open page. An archived drawing is never it: the canvas shows live work,
  // and the archive screen is where a held page is looked at (and restored).
  const activeDrawing = useMemo(() => {
    const live = liveDrawings(data);
    return (
      live.find((d) => d.id === data.activeDrawingId) ??
      live[0] ??
      data.drawings[0]
    );
  }, [data]);

  const setActive = useCallback(
    (id: string) => {
      setState((prev) => {
        if (prev.data.activeDrawingId === id) return prev;
        markPersist();
        return { ...prev, data: { ...prev.data, activeDrawingId: id } };
      });
    },
    [markPersist],
  );

  /** Replace the active drawing with `patch` applied, stamping `updatedAt`. The
   *  single funnel every page edit goes through, so "when did this change?" has
   *  one answer and one undo step. */
  const patchActive = useCallback(
    (patch: Partial<Drawing>) => {
      const active = activeDrawing;
      if (!active) return;
      commit({
        ...data,
        drawings: data.drawings.map((d) =>
          d.id === active.id
            ? { ...d, ...patch, updatedAt: new Date().toISOString() }
            : d,
        ),
      });
    },
    [activeDrawing, commit, data],
  );

  /** File a finished gesture onto the active page — one mark, one undo step.
   *
   *  `fitPage` grows the sheet so the mark fits on it, in the same step: a
   *  dropped image is placed before it is settled and may well hang off the
   *  edge, and a picture half off the page is not what was dropped. The page
   *  only ever grows right and down — moving the origin would shift every mark
   *  already on it. Ordinary gestures don't ask for it: drawing past the edge is
   *  a slip, not a request for a bigger sheet. */
  const addStroke = useCallback(
    (draft: DraftStroke, options: { fitPage?: boolean } = {}) => {
      const active = activeDrawing;
      if (!active) return;
      // Nowhere to put it: every layer in the stack is locked. The gesture is
      // dropped rather than landed somewhere it was not aimed — a lock that
      // silently redirects a mark is worse than one that refuses it.
      if (!drawableLayer(active)) return;
      // The layer the mark lands on, stamped here and nowhere else. A drawing
      // that has never been given a stack answers `undefined` and the stroke
      // records no layer at all — a one-layer document stays byte-identical to
      // what this app has always written.
      const layer = activeLayerId(active);
      const stroke: Stroke = {
        ...draft,
        id: freshId("stroke"),
        ...(layer ? { layer } : {}),
      };
      const bounds = options.fitPage ? strokeBounds(stroke) : null;
      patchActive({
        strokes: [...active.strokes, stroke],
        ...(bounds ? pageFitting(active, bounds) : {}),
      });
    },
    [activeDrawing, patchActive],
  );

  /** File several finished marks at once — what a paste is.
   *
   *  One edit and one undo step for the lot, which is what a paste has to be:
   *  undoing it must put the page back the way it was, not peel the pasted marks
   *  off one at a time. They land on the layer being drawn on, in the order
   *  given, and the page grows around them exactly as it does for a dropped
   *  picture — a paste is as likely as a drop to arrive past the edge.
   *
   *  Returns the ids it minted, so the caller can leave the pasted marks
   *  selected — which is what makes "paste, then drag it where you wanted it"
   *  one gesture rather than two. */
  const addStrokes = useCallback(
    (drafts: readonly DraftStroke[], options: { fitPage?: boolean } = {}) => {
      const active = activeDrawing;
      if (!active || drafts.length === 0) return [];
      // Nowhere to put them, for the same reason a single mark has nowhere to
      // go: every layer in the stack is locked (see `addStroke`).
      if (!drawableLayer(active)) return [];
      const layer = activeLayerId(active);
      const strokes: Stroke[] = drafts.map((draft) => ({
        ...draft,
        id: freshId("stroke"),
        ...(layer ? { layer } : {}),
      }));
      let bounds: Box | null = null;
      if (options.fitPage) {
        for (const stroke of strokes) {
          const next = strokeBounds(stroke);
          if (next) bounds = bounds ? unionBox(bounds, next) : next;
        }
      }
      patchActive({
        strokes: [...active.strokes, ...strokes],
        ...(bounds ? pageFitting(active, bounds) : {}),
      });
      return strokes.map((s) => s.id);
    },
    [activeDrawing, patchActive],
  );

  /** Take marks off the active page — what deleting (or cutting) a selection
   *  does. One undo step brings the lot back. */
  const deleteStrokes = useCallback(
    (ids: readonly string[]) => {
      const active = activeDrawing;
      if (!active || ids.length === 0) return;
      const doomed = new Set(ids);
      const strokes = active.strokes.filter((s) => !doomed.has(s.id));
      if (strokes.length === active.strokes.length) return;
      patchActive({ strokes });
    },
    [activeDrawing, patchActive],
  );

  /** Shift marks across the page by (`dx`, `dy`) — the drag that moves a
   *  selection. One edit for the whole drag: the canvas shows the move live
   *  without touching the document, and this lands once when the finger lifts,
   *  so undo steps back over the whole move rather than over every frame of it.
   *
   *  Paint order is untouched: a mark keeps its place in the stack (and its
   *  layer) and only its geometry changes. */
  const moveStrokes = useCallback(
    (ids: readonly string[], dx: number, dy: number) => {
      const active = activeDrawing;
      if (!active || ids.length === 0) return;
      if (dx === 0 && dy === 0) return;
      const moving = new Set(ids);
      const strokes = active.strokes.map((s) =>
        moving.has(s.id) ? translateStroke(s, dx, dy) : s,
      );
      // Marks dragged past the right or bottom edge take the sheet with them,
      // the way a dropped picture does — a selection half off the page is not
      // where anyone meant to put it.
      let bounds: Box | null = null;
      for (const stroke of strokes) {
        if (!moving.has(stroke.id)) continue;
        const next = strokeBounds(stroke);
        if (next) bounds = bounds ? unionBox(bounds, next) : next;
      }
      patchActive({
        strokes,
        ...(bounds ? pageFitting(active, bounds) : {}),
      });
    },
    [activeDrawing, patchActive],
  );

  /** Start the page over: every mark gone, the stack back to the sheet and one
   *  layer, and the page colour handed back to the canvas theme. The sheet's
   *  *size* is left alone — "start over" is about what is on the page, and
   *  resizing it is the action next to this one.
   *
   *  One undo step for the lot, like every other page edit, so a mis-aimed
   *  press costs one press to take back. */
  const resetActive = useCallback(() => {
    if (!activeDrawing) return;
    patchActive({
      strokes: [],
      layers: undefined,
      activeLayerId: undefined,
      background: undefined,
    });
  }, [activeDrawing, patchActive]);

  /** Land a baked effect: the drawing's marks, with the layers an effect was
   *  applied to replaced by pictures of themselves (see `bake.ts`).
   *
   *  An ordinary page edit — one undo step, one `updatedAt`, one push to the
   *  cloud — and deliberately nothing more than "here is the new stroke list".
   *  Rasterising needs a canvas, so it happens in the screen where the canvas
   *  is; what reaches the store is a list of strokes like any other.
   *
   *  Undo puts the marks back, which is the whole safety net an effect has: it
   *  is destructive by design, and the panel says so before it is pressed. */
  const applyEffect = useCallback(
    (strokes: Stroke[]) => {
      if (!activeDrawing) return;
      patchActive({ strokes });
    },
    [activeDrawing, patchActive],
  );

  /** Turn the whole page around — mirror it, turn it a quarter, scale it, or
   *  change the sheet under it (see `transform.ts`).
   *
   *  One undo step for the lot, which is the reason it is a single action rather
   *  than a stroke-by-stroke edit: "mirror the page" is one thing you did, and
   *  taking it back should be one thing too. The maths is pure and lives in
   *  `transform.ts`; all the store adds is the history.
   *
   *  The bitmaps are redrawn on the way through (`turnBitmap`), because a
   *  picture's pixels can't be mirrored by moving its frame. */
  const transformActive = useCallback(
    (edit: (drawing: Drawing, bitmap: BitmapTurn) => PageEdit) => {
      const active = activeDrawing;
      if (!active) return;
      patchActive(edit(active, turnBitmap));
    },
    [activeDrawing, patchActive],
  );

  const renameActive = useCallback(
    (name: string) => patchActive({ name }),
    [patchActive],
  );

  // There is deliberately no `setBackground` / `setGround` here. A page's colour
  // and the sheet it is on are answered once, when the drawing is created (see
  // `NewImageModal`), and are what the page *is* rather than edits to it: a wet
  // mark is painted into the sheet it was made on, so changing the stock under a
  // finished painting would repaint every mark on it as something the hand that
  // drew them never saw. Both still *load* — a drawing that carries either paints
  // with it, whoever wrote the file.

  const setAppearance = useCallback(
    (patch: { glyph?: string; color?: string }) => patchActive(patch),
    [patchActive],
  );

  // --- Layers ----------------------------------------------------------------
  //
  // The stack lives on the drawing and the marks stay in one flat array (see
  // `layers.ts`), so every action here is an ordinary page edit: one undo step,
  // one `updatedAt`, one push to the cloud. The exception is selecting a layer,
  // which is navigation rather than an edit and so is written without a history
  // entry — the same treatment `setActive` gives opening a different drawing.

  /** Add a layer directly above the selected one and draw on it. */
  const addLayer = useCallback(
    (name: string): string | null => {
      const active = activeDrawing;
      if (!active) return null;
      const layers = drawingLayers(active);
      const layer: Layer = { id: freshId("layer"), name };
      const above =
        layers.findIndex((l) => l.id === activeLayer(active).id) + 1;
      const next = [...layers];
      next.splice(above, 0, layer);
      patchActive({ layers: next, activeLayerId: layer.id });
      return layer.id;
    },
    [activeDrawing, patchActive],
  );

  /** Draw on a different layer. Not an edit: it makes no undo step and doesn't
   *  restamp `updatedAt`, so picking a layer never reshuffles the menu's
   *  most-recently-edited order.
   *
   *  A locked layer is not selectable — selecting one would leave the toolbar
   *  pointed at a layer that then swallowed every stroke. Unlock it first; the
   *  padlock is on the row. */
  const selectLayer = useCallback(
    (id: string) => {
      const active = activeDrawing;
      if (!active || active.activeLayerId === id) return;
      const target = drawingLayers(active).find((layer) => layer.id === id);
      if (!target || isLocked(target)) return;
      markPersist();
      setState((prev) => ({
        ...prev,
        data: {
          ...prev.data,
          drawings: prev.data.drawings.map((d) =>
            d.id === active.id ? { ...d, activeLayerId: id } : d,
          ),
        },
      }));
    },
    [activeDrawing, markPersist],
  );

  /** Show or hide a layer. Hiding takes its marks off the screen and out of
   *  every export — but not out of the document. */
  const setLayerHidden = useCallback(
    (id: string, hidden: boolean) => {
      const active = activeDrawing;
      if (!active) return;
      patchActive({
        layers: drawingLayers(active).map((layer) =>
          layer.id === id ? { ...layer, hidden } : layer,
        ),
      });
    },
    [activeDrawing, patchActive],
  );

  /** Lock a layer against marks, or let it take them again (see
   *  `Layer.locked`). An edit like hiding one: it travels with the drawing and
   *  it undoes. */
  const setLayerLocked = useCallback(
    (id: string, locked: boolean) => {
      const active = activeDrawing;
      if (!active) return;
      const layers = drawingLayers(active).map((layer) =>
        layer.id === id ? { ...layer, locked } : layer,
      );
      // Locking the layer you were drawing on hands the selection to whatever
      // is left open, so the next mark has somewhere to go without anyone
      // having to notice.
      const next = { ...active, layers };
      patchActive({ layers, activeLayerId: activeLayer(next).id });
    },
    [activeDrawing, patchActive],
  );

  /** Move a layer to `to` in the stack, counting from the bottom — what raises
   *  everything drawn on it over the layers it passes. A locked layer stays
   *  where it is: the lock holds its place in the stack as well as its marks.
   *  Where a layer may go at all is `canMoveLayerTo`'s to say — the sheet stays
   *  at the bottom, and nothing slides under it. */
  const moveLayer = useCallback(
    (id: string, to: number) => {
      const active = activeDrawing;
      if (!active) return;
      const layers = drawingLayers(active);
      const from = layers.findIndex((layer) => layer.id === id);
      if (!canMoveLayerTo(active, id, to)) return;
      if (isLocked(layers[from]!)) return;
      patchActive({ layers: reorderLayers(layers, from, to) });
    },
    [activeDrawing, patchActive],
  );

  /** Delete a layer **and the marks on it** — one undo step brings both back.
   *  What may not be deleted is `canDeleteLayer`'s to say; "delete every layer"
   *  is what starting the page over is for. */
  const deleteLayer = useCallback(
    (id: string) => {
      const active = activeDrawing;
      if (!active || !canDeleteLayer(active, id)) return;
      const layers = drawingLayers(active);
      const at = layers.findIndex((layer) => layer.id === id);
      const remaining = layers.filter((layer) => layer.id !== id);
      // Land the selection on the layer that took its place in the stack — the
      // one above it, or the new top when it was the top. A locked one there
      // (the sheet, under a stack of one) is no landing at all, so the fallback
      // walks to whatever is still open.
      const landed = remaining[Math.min(at, remaining.length - 1)]!;
      const landing = isLocked(landed)
        ? activeLayer({
            ...active,
            layers: remaining,
            activeLayerId: undefined,
          })
        : landed;
      patchActive({
        layers: remaining,
        strokes: strokesExcept(active, id),
        activeLayerId:
          active.activeLayerId === id ? landing.id : active.activeLayerId,
      });
    },
    [activeDrawing, patchActive],
  );

  /** Create a page and open it, optionally filed into a folder.
   *
   *  `init` seeds the new page — the size and the strokes an image dropped onto
   *  the sidebar arrives with — so the drawing is created in its finished state
   *  rather than created blank and then edited, which would be two undo steps
   *  for one gesture. */
  const addDrawing = useCallback(
    (
      name = "",
      folderId: string | null = null,
      init: Partial<Omit<Drawing, "id">> = {},
    ): string => {
      const drawing = { ...blankDrawing(name, folderId), ...init };
      commit({
        ...data,
        drawings: [...data.drawings, drawing],
        activeDrawingId: drawing.id,
      });
      return drawing.id;
    },
    [commit, data],
  );

  /** Duplicate a page, marks and all — the "start from this sketch" move. */
  const duplicateDrawing = useCallback(
    (id: string): string | null => {
      const source = data.drawings.find((d) => d.id === id);
      if (!source) return null;
      const copy: Drawing = {
        ...source,
        id: freshId("drawing"),
        strokes: source.strokes.map((s) => ({ ...s, id: freshId("stroke") })),
        createdAt: new Date().toISOString(),
        updatedAt: undefined,
      };
      commit({
        ...data,
        drawings: [...data.drawings, copy],
        activeDrawingId: copy.id,
      });
      return copy.id;
    },
    [commit, data],
  );

  const renameDrawing = useCallback(
    (id: string, name: string) => {
      commit({
        ...data,
        drawings: data.drawings.map((d) =>
          d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d,
        ),
      });
    },
    [commit, data],
  );

  /** Delete a page. The last page is never removed outright — it is replaced by
   *  a fresh blank one, so the app always has something to draw on. */
  const deleteDrawing = useCallback(
    (id: string) => {
      const remaining = data.drawings.filter((d) => d.id !== id);
      // "The last page" means the last *live* one: with everything else in the
      // archive, deleting the open drawing still has to leave a page to draw
      // on, and un-archiving one to get there would be a surprise.
      const drawings = remaining.some((d) => !d.archived)
        ? remaining
        : [...remaining, blankDrawing("")];
      commit({
        ...data,
        drawings,
        activeDrawingId: nextActiveId(drawings, data.activeDrawingId),
      });
    },
    [commit, data],
  );

  /** Star / unstar a drawing — what puts it in the menu's Favorites section. */
  const toggleFavorite = useCallback(
    (id: string) => {
      const target = data.drawings.find((d) => d.id === id);
      if (!target) return;
      commit({
        ...data,
        drawings: patchDrawings(data.drawings, new Set([id]), {
          favorite: !target.favorite,
        }),
      });
    },
    [commit, data],
  );

  /** File a drawing into a folder, or lift it back to the top level with
   *  `null`. */
  const moveDrawingToFolder = useCallback(
    (id: string, folderId: string | null) => {
      commit({
        ...data,
        drawings: patchDrawings(data.drawings, new Set([id]), { folderId }),
      });
    },
    [commit, data],
  );

  /** Deliver one side of a hand-off to another namespace's storage, then check
   *  it actually landed there before this namespace lets go of it.
   *
   *  Two documents change and only one of them is in React state: the
   *  destination isn't loaded, so it is written straight through the backend.
   *  That write is a best-effort sink — it reports a failure rather than
   *  throwing (see `DocBackend`) — so "it didn't throw" is not evidence the
   *  bytes are there. Reading the destination back and looking for the ids the
   *  hand-off minted is; only then is this side committed without the item.
   *  Returns whether the move went through. */
  const deliver = useCallback(
    (targetSlug: string, moved: Handoff | null): boolean => {
      if (!moved) return false;
      let landed = false;
      try {
        state.backend.save(targetSlug, moved.target);
        const written = state.backend.load(targetSlug);
        const drawings = new Set(written.drawings.map((d) => d.id));
        const folders = new Set(written.folders.map((f) => f.id));
        landed =
          moved.arrived.drawings.every((id) => drawings.has(id)) &&
          (moved.arrived.folder === undefined ||
            folders.has(moved.arrived.folder));
      } catch {
        landed = false;
      }
      if (!landed) {
        output.error(
          "Couldn't move that into the other sketchbook — its copy on this device wouldn't take the change (its storage may be full). Nothing was moved.",
        );
        return false;
      }
      commit(moved.source);
      return true;
    },
    [commit, state.backend],
  );

  /** Hand a drawing to another sketchbook — the menu's "drop it onto a
   *  namespace row" gesture. It lands at that sketchbook's top level: the
   *  folder it was filed in is this one's, and doesn't exist over there. */
  const moveDrawingToNamespace = useCallback(
    (id: string, targetSlug: string) => {
      if (targetSlug === state.slug) return;
      let moved: Handoff | null;
      try {
        moved = handOffDrawing(data, state.backend.load(targetSlug), id, MINT);
      } catch {
        return; // The destination's storage wouldn't even read — leave it be.
      }
      deliver(targetSlug, moved);
    },
    [data, deliver, state.slug, state.backend],
  );

  /** Hand a folder — and the drawings filed in it — to another sketchbook. The
   *  group travels together: the folder is re-created over there and its
   *  drawings are re-filed inside it, so it arrives as a group rather than as
   *  loose pages. */
  const moveFolderToNamespace = useCallback(
    (id: string, targetSlug: string) => {
      if (targetSlug === state.slug) return;
      let moved: Handoff | null;
      try {
        moved = handOffFolder(data, state.backend.load(targetSlug), id, MINT);
      } catch {
        return;
      }
      deliver(targetSlug, moved);
    },
    [data, deliver, state.slug, state.backend],
  );

  /** Hold a drawing in the archive, or bring it back out. Archiving the open
   *  page moves the canvas to the next live one rather than leaving it on a
   *  filed-away drawing. */
  const setDrawingArchived = useCallback(
    (id: string, archived: boolean) => {
      const drawings = patchDrawings(data.drawings, new Set([id]), {
        archived,
      });
      commit({
        ...data,
        drawings,
        activeDrawingId: archived
          ? nextActiveId(drawings, data.activeDrawingId)
          : id,
      });
    },
    [commit, data],
  );

  /** Create a folder. Empty until drawings are filed into it — creating one
   *  never moves anything on its own. */
  const addFolder = useCallback(
    (name: string): string => {
      const folder: Folder = {
        id: freshId("folder"),
        name,
        createdAt: new Date().toISOString(),
      };
      commit({ ...data, folders: [...data.folders, folder] });
      return folder.id;
    },
    [commit, data],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      commit({
        ...data,
        folders: data.folders.map((f) => (f.id === id ? { ...f, name } : f)),
      });
    },
    [commit, data],
  );

  /** Archive a folder — and, with it, every drawing filed inside. Restoring the
   *  folder restores them together, so a group is held and brought back as one
   *  thing rather than card by card. */
  const setFolderArchived = useCallback(
    (id: string, archived: boolean) => {
      const inside = new Set(
        data.drawings.filter((d) => d.folderId === id).map((d) => d.id),
      );
      const drawings = patchDrawings(data.drawings, inside, { archived });
      commit({
        ...data,
        folders: data.folders.map((f) =>
          f.id === id ? { ...f, archived } : f,
        ),
        drawings,
        activeDrawingId: archived
          ? nextActiveId(drawings, data.activeDrawingId)
          : data.activeDrawingId,
      });
    },
    [commit, data],
  );

  /** Delete a folder, keeping its drawings — they lift back to the top level
   *  rather than vanishing with the group. Deleting the box is not deleting
   *  what was in it. */
  const deleteFolder = useCallback(
    (id: string) => {
      const inside = new Set(
        data.drawings.filter((d) => d.folderId === id).map((d) => d.id),
      );
      commit({
        ...data,
        folders: data.folders.filter((f) => f.id !== id),
        drawings: patchDrawings(data.drawings, inside, { folderId: null }),
      });
    },
    [commit, data],
  );

  return {
    slug: state.slug,
    data,
    activeDrawing,
    version,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    undo,
    redo,
    reload,
    adoptRemote,
    setActive,
    addStroke,
    addStrokes,
    deleteStrokes,
    moveStrokes,
    resetActive,
    applyEffect,
    transformActive,
    renameActive,
    setAppearance,
    addLayer,
    selectLayer,
    setLayerHidden,
    setLayerLocked,
    moveLayer,
    deleteLayer,
    addDrawing,
    duplicateDrawing,
    renameDrawing,
    deleteDrawing,
    toggleFavorite,
    moveDrawingToFolder,
    moveDrawingToNamespace,
    moveFolderToNamespace,
    setDrawingArchived,
    addFolder,
    renameFolder,
    setFolderArchived,
    deleteFolder,
  };
}
