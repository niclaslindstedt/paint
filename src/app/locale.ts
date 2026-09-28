// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Where the device is, as far as the app needs to know it.
//
// The app has one English and one Swedish catalog, and the words are the
// catalog's business. What is left to the device is the handful of conventions
// that follow the country rather than the language: which sheet of paper a
// print preset means, and which English `<html lang>` names. Both are read off
// the device's preferred languages (`navigator.languages`), most-preferred
// first, the only place a web page is told where it is.
//
// Pure over the tags, so every rule is testable without a browser; the one
// function that reads `navigator` says so in its name.

/** The device's preferred language tags, most-preferred first — empty where
 *  there is no browser to ask (a test, the build). */
export function deviceLanguageTags(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  if (navigator.languages && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

/** `"en-US"` → `"US"`; `null` for a tag without a region (`"en"`). The region is
 *  the first two-letter or three-digit subtag after the language — anything
 *  else is a script (`zh-Hant-TW`) or a variant. */
export function regionOf(tag: string): string | null {
  const parts = tag.split(/[-_]/).slice(1);
  const region = parts.find(
    (p) => /^[A-Za-z]{2}$/.test(p) || /^\d{3}$/.test(p),
  );
  return region ? region.toUpperCase() : null;
}

/** The country the device's languages point at: the first tag that names one,
 *  else what the most-preferred language is most likely spoken in (`en` → US,
 *  `sv` → SE, through `Intl.Locale#maximize`), else `null`. */
export function deviceRegion(tags: readonly string[]): string | null {
  for (const tag of tags) {
    const region = regionOf(tag);
    if (region) return region;
  }
  const first = tags[0];
  if (!first) return null;
  try {
    return new Intl.Locale(first).maximize().region ?? null;
  } catch {
    return null;
  }
}

/** The English the page is marked up as — `<html lang>`, which the browser's
 *  spell checker and hyphenation read. The catalog is written in US English,
 *  so that is the default; a device that asks for another English (`en-GB`,
 *  `en-AU`) gets the one it asked for. */
export function englishTag(tags: readonly string[]): string {
  for (const tag of tags) {
    const [lang] = tag.split(/[-_]/);
    const region = regionOf(tag);
    if (lang?.toLowerCase() === "en" && region) return `en-${region}`;
  }
  return "en-US";
}
