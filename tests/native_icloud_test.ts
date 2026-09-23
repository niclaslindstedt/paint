// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The iCloud bridge (`native/src/icloudBridge.ts`) and the seam it fills
// (`src/app/icloudHost.ts`).
//
// `native/` is outside the root install and nothing in it is otherwise
// exercised by `make test`, while the failure modes on this seam are all
// silent. A property or event name that drifts on either side does not error —
// the iCloud option simply never appears in the Storage picker, on a build
// nobody can run without Xcode. A method list that falls out of step does not
// error either: the seam's own validation rejects the host, and the backend
// disappears with no message anywhere.
//
// So the two sides are pinned against each other here. `icloud.ts` itself
// reaches for the native module, which the root install does not have — this
// test stays clear of it, which is exactly why `icloudBridge.ts` takes its
// types from the import-free `icloudWire.ts`.

import { describe, expect, it } from "vitest";

import {
  ICLOUD_REQUEST_TYPE,
  ICLOUD_SCRIPT,
  isICloudRequest,
  resolveScript,
} from "../native/src/icloudBridge.ts";
import { ICLOUD_HOST_EVENT, getICloudHost } from "../src/app/icloudHost.ts";

describe("the injected provider", () => {
  it("installs itself where the web app looks for it", () => {
    // The property name is the contract. `icloudHost.ts` reads
    // `window.__paintICloud`; a rename on either side is not an error, it
    // is a backend that never appears.
    expect(ICLOUD_SCRIPT).toContain("window.__paintICloud");
  });

  it("announces itself with the event the seam listens for", () => {
    // The script can run either side of the app's first render, so the
    // announcement is what covers the race. A typo here costs the reader the
    // backend until they reload.
    expect(ICLOUD_SCRIPT).toContain(JSON.stringify(ICLOUD_HOST_EVENT));
  });

  it("offers every method the seam validates, at the version it knows", () => {
    // `getICloudHost` rejects a host missing any one of them, so this is the
    // list the two sides have to agree on. Run against the seam's own
    // validation rather than a copy of the list, so there is nothing to keep
    // in step by hand.
    const host: Record<string, unknown> = { version: 1 };
    for (const method of [
      "status",
      "list",
      "read",
      "write",
      "readBytes",
      "writeBytes",
      "remove",
    ]) {
      expect(ICLOUD_SCRIPT).toContain(`${method}: function`);
      host[method] = () => Promise.resolve(null);
    }
    const globals = globalThis as { window?: unknown };
    const previous = globals.window;
    globals.window = { __paintICloud: host };
    try {
      expect(getICloudHost()).not.toBeNull();
    } finally {
      globals.window = previous;
    }
  });
});

describe("isICloudRequest", () => {
  const good = {
    type: ICLOUD_REQUEST_TYPE,
    id: "i1",
    method: "read",
    args: ["paint-default.json"],
  };

  it("accepts a well-formed request", () => {
    expect(isICloudRequest(good)).toBe(true);
  });

  it("ignores anything the page posts that is not ours", () => {
    // The page may `postMessage` whatever it likes; the wrapper's one channel
    // is shared with the theme report.
    expect(isICloudRequest({ ...good, type: "paint-native/report" })).toBe(
      false,
    );
    expect(isICloudRequest(null)).toBe(false);
    expect(isICloudRequest("read")).toBe(false);
  });

  it("rejects a request with no correlation id", () => {
    // Without an id there is nothing to resolve, so answering it would drop
    // the answer on the floor — better to say so than to look like a hang.
    expect(isICloudRequest({ ...good, id: "" })).toBe(false);
    expect(isICloudRequest({ ...good, id: 1 })).toBe(false);
  });

  it("rejects a method it does not implement", () => {
    expect(isICloudRequest({ ...good, method: "listAll" })).toBe(false);
    expect(isICloudRequest({ ...good, method: "eval" })).toBe(false);
  });

  it("rejects arguments that are not all strings", () => {
    // The native side passes these straight to a path resolver; a non-string
    // would arrive there as `undefined` and be written as a file name.
    expect(isICloudRequest({ ...good, args: "a" })).toBe(false);
    expect(isICloudRequest({ ...good, args: ["a", 2] })).toBe(false);
    expect(isICloudRequest({ ...good, args: [] })).toBe(true);
  });
});

/** Run one settling script the way the WebView would and report what it handed
 *  the page. The script is a whole program, so `new Function` is the closest
 *  thing to `injectJavaScript` a node test has — and running it is the only way
 *  to prove a payload cannot break out of it. */
function runScript(script: string): { id: string; result: unknown } | null {
  let seen: { id: string; result: unknown } | null = null;
  const stub = {
    __paintICloudResolve: (id: string, result: unknown) => {
      seen = { id, result };
    },
  };
  new Function("window", script)(stub);
  return seen;
}

describe("resolveScript", () => {
  it("carries the answer back as parsed JSON, not as a literal", () => {
    const script = resolveScript("i1", { ok: true, value: "{}" });
    expect(script).toContain("JSON.parse(");
    expect(script).toContain("window.__paintICloudResolve");
  });

  it("does not let a drawing's own text break out of the script", () => {
    // The payload is somebody's sketchbook, and a drawing's name is arbitrary
    // user text. This is the case that turns a quote in a title into injected
    // JavaScript the moment the answer is spliced in as a literal — so the
    // script is actually RUN here rather than inspected: a substring check
    // cannot tell an escaped quote from an escaping one.
    const nasty = '");alert(1);//';
    expect(runScript(resolveScript("i1", { ok: true, value: nasty }))).toEqual({
      id: "i1",
      result: { ok: true, value: nasty },
    });
  });

  it("survives a payload full of quotes, backslashes and newlines", () => {
    const nasty = 'O\'Brien \\ "Bosse"\n</script>\u0000';
    expect(runScript(resolveScript("i7", { ok: true, value: nasty }))).toEqual({
      id: "i7",
      result: { ok: true, value: nasty },
    });
  });

  it("escapes the line separators JSON leaves alone", () => {
    // U+2028 / U+2029 are legal inside a JSON string and are NEWLINES to an
    // older JavaScript parser — the one pair `JSON.stringify` does not escape.
    // Spelled with char codes rather than as literals so this file itself
    // holds no raw separator — one pasted into source is invisible in every
    // editor and breaks the parser three lines later.
    const lineSep = String.fromCharCode(0x2028);
    const paraSep = String.fromCharCode(0x2029);
    const script = resolveScript("i1", {
      ok: true,
      value: `a${lineSep}b${paraSep}c`,
    });
    expect(script).not.toContain(lineSep);
    expect(script).not.toContain(paraSep);
    expect(script).toContain("\\u2028");
  });

  it("carries a failure so the page can throw it", () => {
    // A failure crosses as data, not as a rejected promise — the page-side
    // script turns it back into an Error so the sync engine sees its usual
    // backend fault.
    const script = resolveScript("i1", { ok: false, error: "no container" });
    expect(script).toContain("no container");
  });
});
