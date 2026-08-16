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

import { docKey } from "./usePaintStore.ts";

// The app's namespace registry — the "store stays in the app" seam for the
// `namespaces` module. The framework owns the `Namespace` shape and the pure
// list transforms; this hook owns *where* the list and the active-namespace
// pointer live (two localStorage keys) and how a slug maps to a document key
// (delegated to `usePaintStore`'s `docKey`). Switching a namespace just changes
// the active slug — the document store keys off it and swaps the whole set of
// drawings, undo history included.

const LIST_KEY = "paint:namespaces";
const ACTIVE_KEY = "paint:namespace:active";

// First-run registry: **one** sketchbook, on the reserved `default` slug.
//
// One rather than a shelf of samples, because a namespace is a whole separate
// sketchbook — its own drawings, its own undo history — and nobody arrives
// needing two of them. A second one seeded here is a room the user never asked
// for that they then have to find the switcher to get out of; the switcher is
// there for when they *do* want one, and creating it is one press. It is named
// for what it is rather than given a theme of its own, so it reads as "the
// place your drawings are" instead of as one option among several.
const SEED_NAMESPACES: Namespace[] = normalizeNamespaces([
  { slug: DEFAULT_NAMESPACE_SLUG, name: "Default" },
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
      try {
        localStorage.removeItem(docKey(slug));
      } catch {
        // Storage unavailable — the registry edit above still stands.
      }
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
