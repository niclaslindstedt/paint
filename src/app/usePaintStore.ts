// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { pageFitting, strokeBounds, unionBox, type Box } from "./bounds.ts";
import {
  freshId,
  localDocBackend,
  starterDoc,
  type DocBackend,
} from "./docBackend.ts";
import {
  committed,
  redone,
  undone,
  windowOf,
  windowOn,
  CLEAR,
  type PageWindow,
  type Rung,
  type Timeline,
} from "./history.ts";
import {
  activeLayer,
  activeLayerId,
  canDeleteLayer,
  canMoveLayerTo,
  drawableLayer,
  drawingLayers,
  isLocked,
  reorderLayers,
  resetLayers,
  strokesExcept,
} from "./layers.ts";
import { turnBitmap } from "./images.ts";
import { flattenedStack, mergedStack } from "./merge.ts";
import { parseDoc } from "./migrations.ts";
import type { Selection } from "./selection.ts";
import type { BitmapTurn, PageEdit } from "./transform.ts";
import {
  liveDrawings,
  type AppData,
  type Drawing,
  type Layer,
  type Stroke,
} from "./types.ts";
import { useHandoff } from "./useHandoff.ts";
import { useSketchbook } from "./useSketchbook.ts";
import type { DraftStroke } from "./plugins/types.ts";

// The app's data store. Holds one namespace's document in state, persists it
// through a `DocBackend`, and exposes the edit actions the screens drive —
// adding strokes, adding / renaming / clearing drawings, switching the active
// page — over an undo / redo history. This is the framework's "store stays in
// the app" seam: the framework owns storage adapters, namespaces, and the UI
// kit; this hook owns where each namespace's document lives and how edits stack
// up.
//
// Every mark is one undo step. That is the whole reason the document is vector:
// a step back is a value, not a bitmap snapshot per stroke. Every settled
// *selection* is one too — the window rides the same timeline beside the
// document without ever being part of it (see `history.ts`).
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

/** What a page edit does besides landing marks.
 *
 *  `fitPage` grows the sheet so what it lands fits on it, in the same step: a
 *  dropped image is placed before it is settled and may well hang off the edge,
 *  and a picture half off the page is not what was dropped. The page only ever
 *  grows right and down — moving the origin would shift every mark already on
 *  it. Ordinary gestures don't ask for it: drawing past the edge is a slip, not
 *  a request for a bigger sheet.
 *
 *  `select` is the window the edit leaves behind, in the **same** rung of the
 *  timeline: a paste lands its marks selected, a drag carries the window with
 *  the ink, a crop puts it away because it has moved every mark out from under
 *  it. Left out, the window is untouched — given, one step back takes the marks
 *  *and* the window, which is the only way undo can mean what it says for an
 *  edit that changed both. */
type EditOptions = { fitPage?: boolean; select?: Selection | null };

/** The present as the timeline keeps it: the document, and the window cut in
 *  it (see `history.ts`). */
function rungOf(state: { data: AppData; window: PageWindow | null }): Rung {
  return { data: state.data, window: state.window };
}

/** The window an edit's `select` asks to leave behind, as the timeline keeps
 *  it — and `undefined` for an edit that says nothing about the window, which
 *  is what leaves the one already up alone. */
function windowFor(
  select: Selection | null | undefined,
  page: string,
): PageWindow | null | undefined {
  return select === undefined ? undefined : windowOf(select, page);
}

export type PaintStore = ReturnType<typeof usePaintStore>;

export function usePaintStore(
  slug: string,
  backend: DocBackend = localDocBackend,
  /** Told when the sketchbook has just been emptied — the last live page
   *  deleted and a blank one put in its place. The store has nothing to say
   *  about what should happen then beyond minting the page; what a fresh start
   *  is made of is the settings' answer, and `App.tsx` hands it in (see
   *  `kit.ts`). Held in a ref, so a caller passing a fresh closure on every
   *  render doesn't rebuild every edit callback under it. */
  onEmptied?: () => void,
) {
  // The active slug and the backend travel *with* the document in state, so the
  // persist effect can never write one namespace's data under another's key.
  //
  // `hydrated` says whether `data` is the stored document or a placeholder
  // standing in until storage answers. `main.tsx` pre-loads the namespace the
  // app opens on, so the common path is hydrated on the very first render and
  // there is no placeholder to see; only switching to a sketchbook not yet read
  // this session goes through one, for as long as an IndexedDB read takes.
  //
  // `window` is the selection — the area a marquee (or the draw-select nib) has
  // cut, stamped with the page it was cut in. The store holds it without ever
  // *saving* it: it is nowhere in `data`, so no byte of it reaches disk or a
  // backend. It is here for one reason — it rides the undo timeline beside the
  // document, so a selection painted wrong is one ⌘/Ctrl+Z away like everything
  // else you do (see `history.ts`).
  const [state, setState] = useState(() => {
    const at = backend.peek(slug);
    return {
      slug,
      backend,
      data: at ?? starterDoc(),
      hydrated: at !== null,
      window: null as PageWindow | null,
    };
  });
  // Edit history. `setActive` replaces the present without pushing, so
  // navigation never clutters undo; every content edit goes through `commit`,
  // and every settled change to the window through `setSelection`.
  const timeline = useRef<Timeline>(CLEAR);
  // The *document's* version, which is what tells the sync engine there is
  // something to push. A window moving never bumps it: it is nowhere in the
  // bytes (see `step` and `setSelection`).
  const [version, setVersion] = useState(0);

  // Guards the write-through below: only a real change (an edit, an adopt) may
  // persist. State produced by *loading* a document — the initial mount, a
  // namespace switch, a reload — must NOT be written back, so a blank starter
  // that `load` returned because the stored bytes were momentarily unreadable
  // can never overwrite the real (still-on-disk) copy.
  const emptied = useRef(onEmptied);
  emptied.current = onEmptied;

  const persistPending = useRef(false);
  const markPersist = useCallback(() => {
    persistPending.current = true;
  }, []);

  // The live state, for the callbacks that must reach it without being rebuilt
  // on every edit — `reload` and the hand-off verbs, which travel down to
  // buttons and drop targets that would otherwise re-render with each stroke.
  const stateRef = useRef(state);
  stateRef.current = state;

  // The page a window would be cut in. Read when a selection lands rather than
  // closed over, so `setSelection` is built once and never rebuilt as the
  // document changes under it — it travels into the canvas's own handlers, and
  // a callback that changed with every mark would rebuild them all.
  const pageRef = useRef<string | undefined>(undefined);

  // Namespace switch — or a backend swap — adopts the matching document and
  // resets history. Adjusting state during render (rather than in an effect) is
  // React's blessed way to respond to a changed input with no stale-doc flash.
  if (state.slug !== slug || state.backend !== backend) {
    timeline.current = CLEAR;
    const at = backend.peek(slug);
    setState({
      slug,
      backend,
      data: at ?? starterDoc(),
      hydrated: at !== null,
      window: null,
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

  /** File a new document as the present, one rung further along.
   *
   *  `window` is the selection the edit leaves behind, in the same rung (see
   *  `EditOptions`). Left out — the ordinary case — the window is untouched, so
   *  painting inside one and undoing that leaves you where you were: the mark
   *  gone, the window still up, ready for the next try. */
  const commit = useCallback(
    (next: AppData, nextWindow?: PageWindow | null) => {
      markPersist();
      setState((prev) => {
        timeline.current = committed(timeline.current, rungOf(prev));
        // An edited document is the real one, whatever storage was about to
        // say — see the hydrate effect above.
        return {
          ...prev,
          data: next,
          hydrated: true,
          window: nextWindow === undefined ? prev.window : nextWindow,
        };
      });
      setVersion((v) => v + 1);
    },
    [markPersist],
  );

  /** Step the timeline, in either direction (see `history.ts`).
   *
   *  A rung that only moved the window changes no document, and that is worth
   *  noticing rather than papering over: nothing is written to storage and the
   *  version counter stands still, so taking back a marquee doesn't wake the
   *  sync engine to push a document that hasn't changed a byte. */
  const step = useCallback(
    (take: typeof undone) => {
      const at = take(timeline.current, rungOf(stateRef.current));
      if (!at) return;
      timeline.current = at.timeline;
      const edited = at.present.data !== stateRef.current.data;
      if (edited) markPersist();
      setState((cur) => ({ ...cur, ...at.present }));
      if (edited) setVersion((v) => v + 1);
    },
    [markPersist],
  );

  const undo = useCallback(() => step(undone), [step]);
  const redo = useCallback(() => step(redone), [step]);

  /** Cut a window in the page, move one, or put one away.
   *
   *  A settled window is a rung of its own: Escape, a marquee dragged out,
   *  ⌘/Ctrl+A and every stroke of the draw-select tool can each be taken back
   *  one at a time — which is the point of the window being here at all.
   *
   *  `live` is for a window **in flight**: the frames of a corner grip being
   *  dragged, or of a marquee sliding one across the page. They replace the
   *  present without a rung, so a drag costs one step back rather than one per
   *  pointer sample — its first frame settles the rung and the rest ride on top
   *  of it (see `SelectionFrame.tsx` and `PaintCanvas.tsx`).
   *
   *  Never persists and never bumps `version`: a window is nowhere in the
   *  document, and a sketchbook that pushed itself to the cloud every time you
   *  dragged a marquee would be pushing nothing, loudly. */
  const setSelection = useCallback(
    (selection: Selection | null, options: { live?: boolean } = {}) => {
      const page = pageRef.current;
      setState((prev) => {
        // Nothing showing and nothing asked for — the way an Escape with no
        // window up, or a selection gesture that chose nothing, arrives. A
        // press that changed nothing may not cost a step back.
        if (!windowOn(prev.window, page) && !selection) return prev;
        if (prev.window?.selection === selection) return prev;
        if (!options.live) {
          timeline.current = committed(timeline.current, rungOf(prev));
        }
        return { ...prev, window: page ? windowOf(selection, page) : null };
      });
    },
    [],
  );

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
        timeline.current = CLEAR;
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
  pageRef.current = activeDrawing?.id;

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
    (patch: Partial<Drawing>, nextWindow?: PageWindow | null) => {
      const active = activeDrawing;
      if (!active) return;
      commit(
        {
          ...data,
          drawings: data.drawings.map((d) =>
            d.id === active.id
              ? { ...d, ...patch, updatedAt: new Date().toISOString() }
              : d,
          ),
        },
        nextWindow,
      );
    },
    [activeDrawing, commit, data],
  );

  /** File a finished gesture onto the active page — one mark, one undo step. */
  const addStroke = useCallback(
    (draft: DraftStroke, options: EditOptions = {}) => {
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
      patchActive(
        {
          strokes: [...active.strokes, stroke],
          ...(bounds ? pageFitting(active, bounds) : {}),
        },
        windowFor(options.select, active.id),
      );
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
    (drafts: readonly DraftStroke[], options: EditOptions = {}) => {
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
      patchActive(
        {
          strokes: [...active.strokes, ...strokes],
          ...(bounds ? pageFitting(active, bounds) : {}),
        },
        windowFor(options.select, active.id),
      );
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

  /** Start the page over: every mark gone, the stack back to the sheet and one
   *  layer. What the page *is* survives — its colour, its surface, and whether
   *  it has a sheet at all were decided when it was made and are not marks on
   *  it: a white page cleared in a dark app has to come back white, not swap
   *  to the theme's dark sheet (see `canvas.ts`, `resetLayers`). The sheet's
   *  *size* is left alone for the same reason — "start over" is about what is
   *  on the page, and resizing it is the action next to this one.
   *
   *  One undo step for the lot, like every other page edit, so a mis-aimed
   *  press costs one press to take back. */
  const resetActive = useCallback(() => {
    if (!activeDrawing) return;
    patchActive({
      strokes: [],
      layers: resetLayers(activeDrawing),
      activeLayerId: undefined,
    });
  }, [activeDrawing, patchActive]);

  /** Land a whole new stroke list on the active page.
   *
   *  Two callers, and both are edits the *screen* works out because both need a
   *  canvas or a selection the store knows nothing about: a baked effect, whose
   *  layers come back as pictures of themselves (see `bake.ts`), and a
   *  selection's move or erase, which cuts the marks under the window
   *  (`selection.ts`).
   *
   *  An ordinary page edit — one undo step, one `updatedAt`, one push to the
   *  cloud — and deliberately nothing more than "here is the new stroke list".
   *  Undo puts the marks back exactly as they were, which is the whole safety
   *  net either edit has.
   *
   *  `fitPage` grows the sheet around the new marks, the way a dropped picture
   *  grows it: a selection dragged past the right or bottom edge is not where
   *  anyone meant to put it. */
  const applyStrokes = useCallback(
    (strokes: Stroke[], options: EditOptions = {}) => {
      const active = activeDrawing;
      if (!active) return;
      let bounds: Box | null = null;
      if (options.fitPage) {
        for (const stroke of strokes) {
          const next = strokeBounds(stroke);
          if (next) bounds = bounds ? unionBox(bounds, next) : next;
        }
      }
      patchActive(
        {
          strokes,
          ...(bounds ? pageFitting(active, bounds) : {}),
        },
        windowFor(options.select, active.id),
      );
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
    (
      edit: (drawing: Drawing, bitmap: BitmapTurn) => PageEdit,
      options: { select?: Selection | null } = {},
    ) => {
      const active = activeDrawing;
      if (!active) return;
      patchActive(
        edit(active, turnBitmap),
        windowFor(options.select, active.id),
      );
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

  /** Merge layers into one — every mark they hold, in the order it was
   *  painted, on the layer that is left. One undo step, like every other edit
   *  to the stack. What may be merged with what is `merge.ts`'s to say. */
  const mergeLayers = useCallback(
    (sources: readonly string[], target: string) => {
      const active = activeDrawing;
      if (!active) return;
      const merged = mergedStack(active, sources, target);
      if (!merged) return;
      patchActive(merged);
    },
    [activeDrawing, patchActive],
  );

  /** Put every drawing in the sketchbook on a single layer — what switching the
   *  layers panel off asks for, once the dialog has said what it costs (see
   *  `merge.ts`).
   *
   *  Every drawing rather than the open one, because the thing being switched
   *  off is not a property of a page: the promise is "this sketchbook has one
   *  layer per drawing", and a stack left on the page you happen not to be
   *  looking at would be one nothing could reach — its hidden layers invisible,
   *  its locked ones unreachable, with the panel that manages them gone. Archived
   *  pages are in it for the same reason: restoring one should not bring a stack
   *  back with it.
   *
   *  One `commit`, so the whole thing is one undo step — and `updatedAt` is
   *  deliberately left alone. This is a change of mode, not an afternoon's work
   *  on a page, and restamping every drawing at once would throw away the
   *  most-recently-edited order the drawings menu is read in. */
  const flattenLayers = useCallback(() => {
    let changed = false;
    const drawings = data.drawings.map((drawing) => {
      const flat = flattenedStack(drawing);
      if (!flat) return drawing;
      changed = true;
      return { ...drawing, ...flat };
    });
    if (!changed) return;
    commit({ ...data, drawings });
  }, [commit, data]);

  // The sketchbook itself: the pages and the folders they are filed in. Its
  // verbs know nothing about strokes and are driven by the menu and the sidebar
  // rather than the canvas, so they live beside the store (`useSketchbook.ts`)
  // and land on the timeline it owns like every other edit.
  const sketchbook = useSketchbook(data, commit, emptied);

  // Handing a drawing — or a folder and everything filed in it — to another
  // sketchbook: the one family of edits that writes a document this app does
  // not have open, and so the one that lives beside the store (`useHandoff.ts`).
  const { moveDrawingToNamespace, moveFolderToNamespace } = useHandoff(
    stateRef,
    commit,
  );

  return {
    slug: state.slug,
    data,
    activeDrawing,
    version,
    /** The window cut in the page being looked at, and never another page's:
     *  opening a different drawing shows none, and coming back finds this one
     *  where you left it. */
    selection: windowOn(state.window, activeDrawing?.id),
    setSelection,
    canUndo: timeline.current.past.length > 0,
    canRedo: timeline.current.future.length > 0,
    undo,
    redo,
    reload,
    adoptRemote,
    setActive,
    addStroke,
    addStrokes,
    deleteStrokes,
    resetActive,
    applyStrokes,
    transformActive,
    renameActive,
    setAppearance,
    addLayer,
    selectLayer,
    setLayerHidden,
    setLayerLocked,
    moveLayer,
    deleteLayer,
    mergeLayers,
    flattenLayers,
    ...sketchbook,
    moveDrawingToNamespace,
    moveFolderToNamespace,
  };
}
