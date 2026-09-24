// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Splicing text into a script the wrapper injects.
//
// Import-free on purpose: the bridges that use it are exercised from the root
// test suite, which has no `expo` installed (see `icloudWire.ts`).

/**
 * A JavaScript string literal holding `text`, safe to splice into a script.
 * `JSON.stringify` handles the quoting; U+2028 and U+2029 are the two
 * characters it does NOT escape and which an older JavaScript parser treats
 * as newlines, so they are escaped by hand.
 */
export function escapeForScript(text: string): string {
  return JSON.stringify(text)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
