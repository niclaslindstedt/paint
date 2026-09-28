// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The save-file bridge (`native/src/saveFileBridge.ts`) against the framework's
// `saveFile`, which is the page's half of the same contract.
//
// Every failure on this seam is silent: a descriptor the framework does not
// read leaves the page downloading into a WebView that saves nothing, and a
// result it does not recognise leaves an export waiting forever. So the
// injected script is RUN against a stand-in for the WebView's window, the
// request the framework posts is checked the way `App.tsx` checks it, and the
// answer goes back through the script the shell injects.

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SAVE_FILE_MESSAGE,
  saveFile,
} from "@niclaslindstedt/oss-framework/files";
import {
  NATIVE_SHELL_PROPERTY,
  isNativeShell,
  isStandaloneMobile,
  nativeShellCan,
} from "@niclaslindstedt/oss-framework/pwa";

import { AUTH_SESSION_REQUEST_TYPE } from "../native/src/authSessionBridge.ts";
import { ICLOUD_REQUEST_TYPE } from "../native/src/icloudBridge.ts";
import {
  SAVE_FILE_DESCRIPTOR,
  SAVE_FILE_TYPE,
  bareName,
  isInPageUrl,
  isSaveFileRequest,
  saveFileResultScript,
} from "../native/src/saveFileBridge.ts";
import { decodeBase64, stubBrowser, stubWebView } from "./support/shell.ts";

/** Run an injected script the way the WebView would, against the stubbed
 *  global `window`. */
function inject(script: string): void {
  new Function(script)();
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("the descriptor", () => {
  it("is where the framework reads it, and advertises save-file", () => {
    expect(NATIVE_SHELL_PROPERTY).toBe("__ossShell");
    const { win } = stubWebView(() => {});
    expect(nativeShellCan("save-file")).toBe(false);
    inject(SAVE_FILE_DESCRIPTOR);
    expect(win.__ossShell).toEqual({ version: 1, capabilities: ["save-file"] });
    expect(nativeShellCan("save-file")).toBe(true);
  });

  it("joins a descriptor another contract put there, once", () => {
    const { win } = stubWebView(() => {}, ["other"]);
    inject(SAVE_FILE_DESCRIPTOR);
    inject(SAVE_FILE_DESCRIPTOR);
    expect(win.__ossShell).toEqual({
      version: 1,
      capabilities: ["other", "save-file"],
    });
  });

  it("makes the page count as standalone on a phone, like an installed app", () => {
    // D29: the framework's shell detection. No `matchMedia` in node, so a
    // phone's browser tab is not standalone and the shell alone makes it so.
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
      maxTouchPoints: 5,
    });
    vi.stubGlobal("window", new EventTarget());
    expect(isStandaloneMobile()).toBe(false);
    stubWebView(() => {});
    inject(SAVE_FILE_DESCRIPTOR);
    expect(isNativeShell()).toBe(true);
    expect(isStandaloneMobile()).toBe(true);
  });
});

describe("a save, end to end", () => {
  it("posts what App.tsx routes, and settles on the script it injects", async () => {
    const downloads = stubBrowser();
    const { posted } = stubWebView((message) =>
      inject(saveFileResultScript(message.id, true)),
    );
    inject(SAVE_FILE_DESCRIPTOR);

    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255]);
    await expect(
      saveFile({
        blob: new Blob([bytes], { type: "image/png" }),
        filename: "harbour.png",
      }),
    ).resolves.toBe("shared");

    expect(downloads).toHaveLength(0);
    expect(posted).toHaveLength(1);
    const request: unknown = JSON.parse(JSON.stringify(posted[0]));
    expect(isSaveFileRequest(request)).toBe(true);
    expect(posted[0]!.type).toBe(SAVE_FILE_TYPE);
    expect(posted[0]!.filename).toBe("harbour.png");
    expect(posted[0]!.mimeType).toBe("image/png");
    expect(Array.from(decodeBase64(posted[0]!.base64))).toEqual(
      Array.from(bytes),
    );
  });

  it("rejects with the shell's error, however it is spelled", async () => {
    stubBrowser();
    const nasty = `no room");alert(1);//${String.fromCharCode(0x2028)}`;
    stubWebView((message) =>
      inject(saveFileResultScript(message.id, false, nasty)),
    );
    inject(SAVE_FILE_DESCRIPTOR);
    await expect(
      saveFile({ text: "{}", filename: "paint.json" }),
    ).rejects.toThrow(nasty);
  });

  it("settles only the save it answers", async () => {
    stubBrowser();
    stubWebView((message) => {
      inject(saveFileResultScript(`${message.id}-other`, false, "not yours"));
      inject(saveFileResultScript(message.id, true));
    });
    inject(SAVE_FILE_DESCRIPTOR);
    await expect(saveFile({ text: "x", filename: "x.txt" })).resolves.toBe(
      "shared",
    );
  });
});

describe("isSaveFileRequest", () => {
  const good = {
    type: SAVE_FILE_MESSAGE,
    version: 1,
    id: "sf1",
    filename: "a.png",
    mimeType: "image/png",
    base64: "AA==",
  };

  it("names the framework's message", () => {
    expect(SAVE_FILE_TYPE).toBe(SAVE_FILE_MESSAGE);
    expect(isSaveFileRequest(good)).toBe(true);
  });

  it("ignores the wrapper's other messages", () => {
    expect(isSaveFileRequest({ ...good, type: ICLOUD_REQUEST_TYPE })).toBe(
      false,
    );
    expect(
      isSaveFileRequest({ ...good, type: AUTH_SESSION_REQUEST_TYPE }),
    ).toBe(false);
    expect(isSaveFileRequest(null)).toBe(false);
    expect(isSaveFileRequest("save")).toBe(false);
  });

  it("rejects a request missing a field", () => {
    for (const key of Object.keys(good)) {
      const partial: Record<string, unknown> = { ...good };
      delete partial[key];
      expect(isSaveFileRequest(partial)).toBe(false);
    }
    expect(isSaveFileRequest({ ...good, id: "" })).toBe(false);
  });
});

describe("what the shell writes", () => {
  it("keeps only the last path component of a name", () => {
    expect(bareName("harbour.png")).toBe("harbour.png");
    expect(bareName("../../Library/harbour.png")).toBe("harbour.png");
    expect(bareName("a\\b.pct")).toBe("b.pct");
    expect(bareName("..")).toBe("file");
    expect(bareName("dir/")).toBe("file");
  });

  it("refuses a URL that exists only inside the page", () => {
    expect(isInPageUrl("blob:http://localhost:8271/0b1c")).toBe(true);
    expect(isInPageUrl("data:image/png;base64,AA==")).toBe(true);
    expect(isInPageUrl("DATA:text/plain,x")).toBe(true);
    expect(isInPageUrl("http://localhost:8271/")).toBe(false);
    expect(isInPageUrl("https://example.com/blob:x")).toBe(false);
  });
});
