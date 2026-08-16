// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { pageFitting, strokeBounds, unionBox, type Box } from "./bounds.ts";
import {
  blankDrawing,
  freshId,
  localDocBackend,
  starterDoc,
  type DocBackend,
} from "./docBackend.ts";
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
import { parseDoc } from "./migrations.ts";
import { translateStroke } from "./selection.ts";
import type { BitmapTurn, PageEdit } from "./transform.ts";
import {
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

// The app's data store. Holds one namespace's document in state, persists it
// through a `DocBackend`, and exposes the edit actions the screens drive —
// adding strokes, adding / renaming / clearing drawings, switching the active
// page — over an undo / redo history. This is the framework's "store stays in
// the app" seam: the framework owns storage adapters, namespaces, and the UI
// kit; this hook owns where each namespace's document lives and how edits stack
// up.
//
// Every mark is one undo step. That is the whole reason the document is vector:
// undo is `pop()`, not a bitmap snapshot per stroke.
//
// The document is kept in IndexedDB (see `docDb.ts`), which is why the backend
// below has both a synchronous `peek` and an asynchronous `hydrate`: the store
// itself is synchronous — it reads the document during render and undoes by
// popping an array — so the database is reached through a cache that is filled
// before first paint rather than awaited in the middle of a gesture.

// The storage seam and the document constructors live in `docBackend.ts` — the
// bytes are a separate concern from the edits. Re-exported here because this
// module is the store's front door and every screen already imports them from
// it.
export {
  blankDrawing,
  docKey,
  freshId,
  localDocBackend,
  starterDoc,
  type DocBackend,
} from "./docBackend.ts";

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
  //
  // `hydrated` says whether `data` is the stored document or a placeholder
  // standing in until storage answers. `main.tsx` pre-loads the namespace the
  // app opens on, so the common path is hydrated on the very first render and
  // there is no placeholder to see; only switching to a sketchbook not yet read
  // this session goes through one, for as long as an IndexedDB read takes.
  const [state, setState] = useState(() => {
    const at = backend.peek(slug);
    return { slug, backend, data: at ?? starterDoc(), hydrated: at !== null };
  });
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

  // The live state, for the callbacks that must reach it without being rebuilt
  // on every edit — `reload` and the hand-off verbs, which travel down to
  // buttons and drop targets that would otherwise re-render with each stroke.
  const stateRef = useRef(state);
  stateRef.current = state;

  // Namespace switch — or a backend swap — adopts the matching document and
  // resets history. Adjusting state during render (rather than in an effect) is
  // React's blessed way to respond to a changed input with no stale-doc flash.
  if (state.slug !== slug || state.backend !== backend) {
    past.current = [];
    future.current = [];
    const at = backend.peek(slug);
    setState({
      slug,
      backend,
      data: at ?? starterDoc(),
      hydrated: at !== null,
    });
  }

  const data = state.data;

  // Fill in a document the switch above could only guess at. Adopting it is a
  // *load*, not an edit: history stays clear and nothing is marked to persist,
  // so the placeholder can never be written over the real document.
  useEffect(() => {
    if (state.hydrated) return;
    let cancelled = false;
    void state.backend.hydrate(state.slug).then((loaded) => {
      if (cancelled) return;
      setState((cur) => {
        // Not just "same namespace" but "still waiting": drawing on the
        // placeholder makes it the real document (`commit` flips the flag), and
        // a read that lands a moment later must not undo that mark.
        if (cur.hydrated || cur.slug !== state.slug) return cur;
        if (cur.backend !== state.backend) return cur;
        return { ...cur, data: loaded, hydrated: true };
      });
      setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [state.hydrated, state.slug, state.backend]);

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
        // An edited document is the real one, whatever storage was about to
        // say — see the hydrate effect above.
        return { ...prev, data: next, hydrated: true };
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
   *  back would defeat the non-destructive load guard.
   *
   *  Goes past the cache deliberately: the whole question being asked is what
   *  *another tab* wrote, and this tab's cache is by definition ignorant of it. */
  const reload = useCallback(() => {
    const { slug: at, backend: from } = stateRef.current;
    void from.refetch(at).then((fresh) => {
      setState((now) =>
        now.slug === at && now.backend === from
          ? { ...now, data: fresh, hydrated: true }
          : now,
      );
      setVersion((v) => v + 1);
    });
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
        // An adopted remote copy is authoritative for the same reason an edit
        // is: a slower local read must not land on top of it.
        return { ...cur, data: doc, hydrated: true };
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
   *  Resolves to whether the move went through.
   *
   *  Asynchronous because the storage is: `deliver` writes to the database and
   *  waits for it to confirm, then reads the record back past the cache. Both
   *  waits are the guarantee — a cached read would only be the write agreeing
   *  with itself. */
  const deliver = useCallback(
    async (targetSlug: string, moved: Handoff | null): Promise<boolean> => {
      if (!moved) return false;
      let landed = false;
      try {
        const written = await stateRef.current.backend.deliver(
          targetSlug,
          moved.target,
        );
        if (written) {
          const drawings = new Set(written.drawings.map((d) => d.id));
          const folders = new Set(written.folders.map((f) => f.id));
          landed =
            moved.arrived.drawings.every((id) => drawings.has(id)) &&
            (moved.arrived.folder === undefined ||
              folders.has(moved.arrived.folder));
        }
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
    [commit],
  );

  /** Hand a drawing to another sketchbook — the menu's "drop it onto a
   *  namespace row" gesture. It lands at that sketchbook's top level: the
   *  folder it was filed in is this one's, and doesn't exist over there. */
  const moveDrawingToNamespace = useCallback(
    async (id: string, targetSlug: string) => {
      const { slug: from, backend: store } = stateRef.current;
      if (targetSlug === from) return;
      let moved: Handoff | null;
      try {
        // The destination isn't the open sketchbook, so it is very likely not
        // in hand — hydrate it rather than reading a cache that would answer
        // "empty" and hand the drawing to a document that wipes the rest.
        const target = await store.hydrate(targetSlug);
        moved = handOffDrawing(stateRef.current.data, target, id, MINT);
      } catch {
        return; // The destination's storage wouldn't even read — leave it be.
      }
      await deliver(targetSlug, moved);
    },
    [deliver],
  );

  /** Hand a folder — and the drawings filed in it — to another sketchbook. The
   *  group travels together: the folder is re-created over there and its
   *  drawings are re-filed inside it, so it arrives as a group rather than as
   *  loose pages. */
  const moveFolderToNamespace = useCallback(
    async (id: string, targetSlug: string) => {
      const { slug: from, backend: store } = stateRef.current;
      if (targetSlug === from) return;
      let moved: Handoff | null;
      try {
        const target = await store.hydrate(targetSlug);
        moved = handOffFolder(stateRef.current.data, target, id, MINT);
      } catch {
        return;
      }
      await deliver(targetSlug, moved);
    },
    [deliver],
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
