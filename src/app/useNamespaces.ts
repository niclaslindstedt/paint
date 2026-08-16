// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback } from "react";

import {
  DEFAULT_NAMESPACE_SLUG,
  addNamespace,
  normalizeNamespaces,
  parseNamespaces,
  removeNamespace,
  renameNamespace,
  serializeNamespaces,
  setNamespaceAppearance,
  type Namespace,
  type NamespaceAppearance,
} from "@niclaslindstedt/oss-framework/namespaces";
import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";

import { ACTIVE_NAMESPACE_KEY, deleteDoc } from "./docDb.ts";

// The app's namespace registry — the "store stays in the app" seam for the
// `namespaces` module. The framework owns the `Namespace` shape and the pure
// list transforms; this hook owns *where* the list and the active-namespace
// pointer live (two localStorage keys — the registry is a short list of names,
// not a document) and where each slug's drawings are kept (delegated to
// `docDb.ts`, which is IndexedDB). Switching a namespace just changes
// the active slug — the document store keys off it and swaps the whole set of
// drawings, undo history included.

const LIST_KEY = "paint:namespaces";
// Shared with the boot preload in `docDb.ts`, which reads this pointer to know
// which sketchbook to pull out of IndexedDB before the first render.
const ACTIVE_KEY = ACTIVE_NAMESPACE_KEY;

// First-run registry: a sketchbook (the reserved `default` slug) plus a
// teaching one, so the switcher is meaningful out of the box. Both boot from
// the empty starter document.
const SEED_NAMESPACES: Namespace[] = normalizeNamespaces([
  { slug: DEFAULT_NAMESPACE_SLUG, name: "Sketchbook" },
  { slug: "teaching", name: "Teaching", glyph: "sparkles", color: "#fbbf24" },
]);

export type NamespacesStore = ReturnType<typeof useNamespaces>;

export function useNamespaces() {
  // The registry is stored in the module's own serial format, not JSON —
  // `parse` / `serialize` overrides keep the stored shape unchanged.
  const [list, setList] = useLocalStorageState<Namespace[]>(
    LIST_KEY,
    SEED_NAMESPACES,
    { parse: (raw) => parseNamespaces(raw), serialize: serializeNamespaces },
  );
  // The active pointer is a raw slug string; a stored slug that left the
  // registry falls back to the default namespace.
  const [activeSlug, setActiveSlug] = useLocalStorageState<string>(
    ACTIVE_KEY,
    DEFAULT_NAMESPACE_SLUG,
    {
      parse: (raw) =>
        list.some((n) => n.slug === raw) ? raw : DEFAULT_NAMESPACE_SLUG,
      serialize: (slug) => slug,
    },
  );

  const switchTo = useCallback(
    (slug: string) => setActiveSlug(slug),
    [setActiveSlug],
  );

  const create = useCallback(
    (name: string, appearance?: NamespaceAppearance) => {
      setList((cur) => {
        const { list: withNew, created } = addNamespace(cur, name);
        switchTo(created.slug);
        return appearance
          ? setNamespaceAppearance(withNew, created.slug, appearance)
          : withNew;
      });
    },
    [setList, switchTo],
  );

  const rename = useCallback(
    (slug: string, name: string) =>
      setList((cur) => renameNamespace(cur, slug, name)),
    [setList],
  );

  const setAppearance = useCallback(
    (slug: string, patch: NamespaceAppearance) =>
      setList((cur) => setNamespaceAppearance(cur, slug, patch)),
    [setList],
  );

  // Removing a namespace drops it from the registry *and* deletes its document
  // (the framework only edits the list — destroying the data is the app's job).
  // If it was active, fall back to the default.
  const remove = useCallback(
    (slug: string) => {
      setList((cur) => removeNamespace(cur, slug));
      // Best-effort and unawaited: the registry edit above is what the user
      // sees, and `deleteDoc` swallows a storage that won't cooperate.
      void deleteDoc(slug);
      setActiveSlug((cur) => (cur === slug ? DEFAULT_NAMESPACE_SLUG : cur));
    },
    [setList, setActiveSlug],
  );

  const activeNamespace = list.find((n) => n.slug === activeSlug) ?? list[0]!;

  return {
    list,
    activeSlug,
    activeNamespace,
    switchTo,
    create,
    rename,
    setAppearance,
    remove,
  };
}
