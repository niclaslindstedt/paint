// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The iCloud capability seam (`src/app/icloudHost.ts`).
//
// Everything this module does is guard a boundary: the provider it validates
// arrives from code outside the bundle, and the values it narrows are whatever
// that code chose to send. The failure modes are all quiet — a host missing one
// method is a backend that appears in the picker and then throws on the first
// save; a status that falls through to `ready` is the app pushing a document at
// a container it cannot reach — so they are pinned here rather than left to a
// device.

import { describe, expect, it } from "vitest";

import {
  getICloudHost,
  parseICloudEntries,
  parseICloudStatus,
  type ICloudHost,
} from "../src/app/icloudHost.ts";

const METHODS = [
  "status",
  "list",
  "read",
  "write",
  "readBytes",
  "writeBytes",
  "remove",
] as const;

/** A well-formed provider, as a host would install it. */
function goodHost(): Record<string, unknown> {
  const host: Record<string, unknown> = { version: 1 };
  for (const method of METHODS) host[method] = () => Promise.resolve(null);
  return host;
}

/** Run `body` with `value` installed where a host would install itself, then
 *  put the global back the way it was. */
function withInstalled<T>(value: unknown, body: () => T): T {
  const globals = globalThis as { window?: unknown };
  const had = "window" in globals;
  const previous = globals.window;
  globals.window = { __paintICloud: value };
  try {
    return body();
  } finally {
    if (had) globals.window = previous;
    else delete globals.window;
  }
}

describe("getICloudHost", () => {
  it("accepts a provider carrying every method", () => {
    const host = withInstalled(goodHost(), getICloudHost);
    expect(host).not.toBeNull();
    // The same object, not a copy — the seam validates, it does not wrap.
    expect(typeof (host as ICloudHost).readBytes).toBe("function");
  });

  it("rejects a provider missing any one method", () => {
    for (const method of METHODS) {
      const partial = goodHost();
      delete partial[method];
      expect(withInstalled(partial, getICloudHost)).toBeNull();
    }
  });

  it("rejects a version this build does not know", () => {
    // Forward compatibility runs this way round: a host announcing v2 is
    // ignored entirely rather than called with the v1 shape.
    expect(withInstalled({ ...goodHost(), version: 2 }, getICloudHost)).toBe(
      null,
    );
  });

  it("reports no host when none is installed", () => {
    expect(withInstalled(undefined, getICloudHost)).toBeNull();
    expect(withInstalled(null, getICloudHost)).toBeNull();
    expect(withInstalled("yes", getICloudHost)).toBeNull();
  });
});

describe("parseICloudStatus", () => {
  it("passes the three states through", () => {
    expect(parseICloudStatus("ready")).toBe("ready");
    expect(parseICloudStatus("signed-out")).toBe("signed-out");
    expect(parseICloudStatus("unavailable")).toBe("unavailable");
  });

  it("falls back to signed-out, never to ready or unavailable", () => {
    // `ready` would push a document at a container the app cannot reach;
    // `unavailable` would hide a backend the reader has already connected.
    for (const junk of ["", "READY", "ok", 1, null, undefined, {}]) {
      expect(parseICloudStatus(junk)).toBe("signed-out");
    }
  });
});

describe("parseICloudEntries", () => {
  it("keeps the path and the revision token", () => {
    expect(
      parseICloudEntries([{ path: "paint-default.json", rev: "17-42" }]),
    ).toEqual([{ path: "paint-default.json", rev: "17-42" }]);
  });

  it("keeps an entry with no revision", () => {
    // A missing `rev` is legal in the framework's `FileEntry`; it only means
    // the aggregate revision cannot be built from that file.
    expect(parseICloudEntries([{ path: "images/a.png" }])).toEqual([
      { path: "images/a.png" },
    ]);
  });

  it("drops malformed rows one at a time", () => {
    // One bad row must not cost the reader every image the sweep would
    // otherwise have found.
    expect(
      parseICloudEntries([
        { path: "images/a.png" },
        { path: "" },
        { rev: "1" },
        null,
        "images/b.png",
        { path: "images/c.png", rev: 7 },
      ]),
    ).toEqual([{ path: "images/a.png" }, { path: "images/c.png" }]);
  });

  it("reads anything that is not a list as nothing", () => {
    expect(parseICloudEntries(null)).toEqual([]);
    expect(parseICloudEntries({ path: "a" })).toEqual([]);
  });
});
