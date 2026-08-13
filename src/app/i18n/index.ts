// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The app's i18n runtime, built once from the framework's `createI18n` factory
// over the app's own catalogs. English is bundled; Swedish is code-split and
// loaded on demand. The app owns the strings (these catalogs); the framework
// owns the machinery that loads, caches, resolves, and re-renders against them
// — including the preference mirror and the first-paint gate `LanguageRoot`
// provides.

import { createI18n } from "@niclaslindstedt/oss-framework/i18n";

import { en, type Catalog } from "./en.ts";

export type Lang = "en" | "sv";
export type { Catalog };

export const i18n = createI18n<Lang, Catalog>({
  fallbackLang: "en",
  fallbackCatalog: en,
  loaders: { sv: () => import("./sv.ts").then((m) => m.sv) },
  // Two-letter codes → concrete BCP-47 tags for `<html lang>` / Intl.
  toBcp47: (lang) => (lang === "sv" ? "sv-SE" : "en-GB"),
  storageKey: "paint:language",
  eventName: "paint:language",
});

export const { LanguageRoot, useT, useLang, setLanguage, supportedLangs } =
  i18n;

/** The translate function `useT()` returns — a message key (optionally with
 *  interpolation params) to a resolved string. Handy where strings are composed
 *  outside a component. */
export type TFn = ReturnType<typeof useT>;

/** A typed message key: the argument `t` accepts. Plugin descriptors carry
 *  these so a tool's label stays a compile-checked catalog path. */
export type TKey = Parameters<TFn>[0];
