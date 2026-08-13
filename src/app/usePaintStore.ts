// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEFAULT_NAMESPACE_SLUG } from "@niclaslindstedt/oss-framework/namespaces";

import { parseDoc, serializeDoc } from "./migrations.ts";
import {
  DEFAULT_CANVAS,
  type AppData,
  type Drawing,
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
export function blankDrawing(name: string): Drawing {
  return {
    id: freshId("drawing"),
    name,
    width: DEFAULT_CANVAS.width,
    height: DEFAULT_CANVAS.height,
    strokes: [],
    createdAt: new Date().toISOString(),
  };
}

/** The document a first-run app opens on: one empty page, ready to draw. */
export function starterDoc(): AppData {
  const first = blankDrawing("");
  return { drawings: [first], activeDrawingId: first.id };
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

/** Pick the active drawing after a delete: keep the current one if it's still
 *  there, otherwise fall to the first page — so removing the open drawing never
 *  leaves the canvas pointed at a gone one. */
function nextActiveId(drawings: Drawing[], current: string): string {
  if (drawings.some((d) => d.id === current)) return current;
  return drawings[0]?.id ?? "";
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

  const activeDrawing = useMemo(
    () =>
      data.drawings.find((d) => d.id === data.activeDrawingId) ??
      data.drawings[0],
    [data],
  );

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

  /** File a finished gesture onto the active page — one mark, one undo step. */
  const addStroke = useCallback(
    (draft: DraftStroke) => {
      const active = activeDrawing;
      if (!active) return;
      const stroke: Stroke = { ...draft, id: freshId("stroke") };
      patchActive({ strokes: [...active.strokes, stroke] });
    },
    [activeDrawing, patchActive],
  );

  /** Wipe the active page's marks, keeping the page itself (and its size and
   *  background). Undoable like any edit. */
  const clearActive = useCallback(() => {
    if (!activeDrawing || activeDrawing.strokes.length === 0) return;
    patchActive({ strokes: [] });
  }, [activeDrawing, patchActive]);

  const renameActive = useCallback(
    (name: string) => patchActive({ name }),
    [patchActive],
  );

  /** Pin the active page's colour, or hand it back to the canvas theme with
   *  `undefined`. */
  const setBackground = useCallback(
    (background: string | undefined) => patchActive({ background }),
    [patchActive],
  );

  const setAppearance = useCallback(
    (patch: { glyph?: string; color?: string }) => patchActive(patch),
    [patchActive],
  );

  /** Create a page and open it. */
  const addDrawing = useCallback(
    (name = ""): string => {
      const drawing = blankDrawing(name);
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
      const drawings = remaining.length > 0 ? remaining : [blankDrawing("")];
      commit({
        drawings,
        activeDrawingId: nextActiveId(drawings, data.activeDrawingId),
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
    clearActive,
    renameActive,
    setBackground,
    setAppearance,
    addDrawing,
    duplicateDrawing,
    renameDrawing,
    deleteDrawing,
  };
}
