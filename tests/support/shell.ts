// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The two places a file can leave the app, stood up in node.
//
// The tests here run without a DOM, so the framework's `saveFile` is met at
// its two boundaries: a browser's download (an anchor clicked at an object
// URL) and the phone app's WebView (react-native-webview's `postMessage`
// bridge, and the `window.__ossShell` descriptor the shell injects before the
// page loads). Each stand-in records what reached it.

import { vi } from "vitest";

import type { SaveFileMessage } from "@niclaslindstedt/oss-framework/files";

/** A file the browser was asked to download. */
export type Download = { filename: string; blob: Blob };

/** A browser tab: just enough `document` for the framework's download, with
 *  object URLs that remember their blob. Undo with `vi.unstubAllGlobals()` and
 *  `vi.restoreAllMocks()`. */
export function stubBrowser(): Download[] {
  const downloads: Download[] = [];
  const blobs = new Map<string, Blob>();
  let next = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    next += 1;
    const url = `blob:test/${next}`;
    blobs.set(url, blob as Blob);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.stubGlobal("document", {
    createElement: () => {
      const anchor = {
        href: "",
        download: "",
        rel: "",
        click: () => {
          downloads.push({
            filename: anchor.download,
            blob: blobs.get(anchor.href)!,
          });
        },
        remove: () => {},
      };
      return anchor;
    },
    body: { appendChild: () => {}, append: () => {} },
  });
  return downloads;
}

export type WebViewWindow = EventTarget & Record<string, unknown>;

/** The phone app's WebView: a `window` carrying react-native-webview's bridge,
 *  which hands every posted save-file request to `onPost` (after a turn, as
 *  the shell's answer comes back through `injectJavaScript`). `capabilities`
 *  is the descriptor the shell injected; leave it out to inject one yourself. */
export function stubWebView(
  onPost: (message: SaveFileMessage, win: WebViewWindow) => void,
  capabilities?: string[],
): { win: WebViewWindow; posted: SaveFileMessage[] } {
  const posted: SaveFileMessage[] = [];
  const win = new EventTarget() as WebViewWindow;
  if (capabilities) win.__ossShell = { version: 1, capabilities };
  win.ReactNativeWebView = {
    postMessage: (data: string) => {
      const message = JSON.parse(data) as SaveFileMessage;
      posted.push(message);
      setTimeout(() => onPost(message, win));
    },
  };
  vi.stubGlobal("window", win);
  return { win, posted };
}

/** The bytes a base64 payload carries. */
export function decodeBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
