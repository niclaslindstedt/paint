// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Every export leaves through the framework's `saveFile`: a download on the
// web, the share sheet in the phone app. A download link clicked by hand
// goes nowhere inside the app's WebView, so the last test keeps one from
// coming back.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { SAVE_FILE_RESULT_EVENT } from "@niclaslindstedt/oss-framework/files";

import { saveDrawing, type ExportOptions } from "../src/app/export.ts";
import type { Drawing } from "../src/app/types.ts";
import { decodeBase64, stubBrowser, stubWebView } from "./support/shell.ts";

const drawing: Drawing = {
  id: "d1",
  name: "Harbour at dusk",
  width: 40,
  height: 30,
  strokes: [],
};

const OPTIONS: ExportOptions = {
  pageColor: "#ffffff",
  defaultInk: "#000000",
  scope: "page",
  transparent: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("saveDrawing on the web", () => {
  it("downloads the file under the drawing's name", async () => {
    const downloads = stubBrowser();
    await expect(saveDrawing(drawing, "svg", OPTIONS)).resolves.toBe(
      "downloaded",
    );
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.filename).toBe("harbour-at-dusk.svg");
    expect(downloads[0]!.blob.type).toBe("image/svg+xml");
    expect(await downloads[0]!.blob.text()).toContain("<svg");
  });

  it("stays a download in a WebView whose shell cannot save a file", async () => {
    const downloads = stubBrowser();
    const { posted } = stubWebView(() => {}, []);
    await expect(saveDrawing(drawing, "svg", OPTIONS)).resolves.toBe(
      "downloaded",
    );
    expect(posted).toHaveLength(0);
    expect(downloads).toHaveLength(1);
  });
});

describe("saveDrawing in the phone app", () => {
  it("hands the file to the shell, which answers once the sheet closes", async () => {
    const downloads = stubBrowser();
    const { posted } = stubWebView(
      (message, win) =>
        win.dispatchEvent(
          new CustomEvent(SAVE_FILE_RESULT_EVENT, {
            detail: { id: message.id, ok: true },
          }),
        ),
      ["save-file"],
    );
    await expect(saveDrawing(drawing, "svg", OPTIONS)).resolves.toBe("shared");
    expect(downloads).toHaveLength(0);
    expect(posted).toHaveLength(1);
    const message = posted[0]!;
    expect(message.filename).toBe("harbour-at-dusk.svg");
    expect(message.mimeType).toBe("image/svg+xml");
    const bytes = decodeBase64(message.base64);
    expect(new TextDecoder().decode(bytes)).toContain("<svg");
  });

  it("rejects with the shell's error, so the menu can say so", async () => {
    stubBrowser();
    stubWebView(
      (message, win) =>
        win.dispatchEvent(
          new CustomEvent(SAVE_FILE_RESULT_EVENT, {
            detail: { id: message.id, ok: false, error: "disk full" },
          }),
        ),
      ["save-file"],
    );
    await expect(saveDrawing(drawing, "svg", OPTIONS)).rejects.toThrow(
      "disk full",
    );
  });
});

describe("the exports", () => {
  it("never click a download link of their own", () => {
    // `downloadBlob` / `downloadText` / an anchor's `download` are the web's
    // download and nothing else: in the phone app they save nothing.
    const offenders = sources(join(import.meta.dirname, "..", "src")).filter(
      (file) =>
        /\b(downloadBlob|downloadText|saveDataUrl)\b|\.download\s*=/.test(
          readFileSync(file, "utf8"),
        ),
    );
    expect(offenders).toEqual([]);
  });
});

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}
