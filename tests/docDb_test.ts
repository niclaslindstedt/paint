// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Where the drawings live on this device. Two things are worth pinning: the
// **cache semantics** — "not read yet" and "empty" must stay distinguishable,
// because a starter document written over a real one is a lost sketchbook —
// and the **one-way move off localStorage**, which is the step every existing
// install takes exactly once and can only take correctly.
//
// The module is imported fresh in each test (`vi.resetModules`) because it
// holds a process-wide cache and a memoised database connection, both of which
// are right for an app that runs once and wrong for a suite that runs many.

const KEY = "paint:doc";

// --- a minimal IndexedDB, enough for one object store of strings -------------

type Fake = {
  records: Map<string, string>;
  /** Make the next `put` fail, the way a full disk does. */
  failNextWrite: boolean;
};

function fakeIndexedDb(fake: Fake) {
  // Requests resolve on a microtask, like the real thing: code that assumes a
  // synchronous answer must fail here too.
  function request<T>(run: () => T) {
    const req: Record<string, unknown> = { result: undefined };
    queueMicrotask(() => {
      try {
        req.result = run();
        (req.onsuccess as (() => void) | undefined)?.();
      } catch {
        (req.onerror as (() => void) | undefined)?.();
      }
    });
    return req;
  }

  const objectStore = {
    get: (key: string) => request(() => fake.records.get(key)),
    put: (value: string, key: string) =>
      request(() => {
        if (fake.failNextWrite) {
          fake.failNextWrite = false;
          throw new Error("quota");
        }
        fake.records.set(key, value);
        return key;
      }),
    delete: (key: string) =>
      request(() => {
        fake.records.delete(key);
        return undefined;
      }),
  };

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => objectStore,
    transaction: () => ({ objectStore: () => objectStore }),
    close: () => {},
  };

  return {
    open: () => {
      const req: Record<string, unknown> = { result: db };
      queueMicrotask(() => (req.onsuccess as (() => void) | undefined)?.());
      return req;
    },
  };
}

// --- a minimal localStorage --------------------------------------------------

function fakeLocalStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    api: {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
    },
  };
}

type DocDb = typeof import("../src/app/docDb.ts");

let fake: Fake;
let legacy: ReturnType<typeof fakeLocalStorage>;

async function loadDocDb(withIdb = true): Promise<DocDb> {
  vi.resetModules();
  fake = { records: new Map(), failNextWrite: false };
  Reflect.set(
    globalThis,
    "indexedDB",
    withIdb ? fakeIndexedDb(fake) : undefined,
  );
  return import("../src/app/docDb.ts");
}

beforeEach(() => {
  legacy = fakeLocalStorage();
  Reflect.set(globalThis, "localStorage", legacy.api);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "indexedDB");
  Reflect.deleteProperty(globalThis, "localStorage");
});

describe("record keys", () => {
  it("keeps the default sketchbook on the un-suffixed key", async () => {
    const db = await loadDocDb();
    expect(db.docKey("default")).toBe(KEY);
    expect(db.docKey("teaching")).toBe(`${KEY}:teaching`);
  });
});

describe("the synchronous cache", () => {
  it("says undefined for a namespace it has never read", async () => {
    const db = await loadDocDb();
    // The distinction the whole design turns on: `undefined` is "still
    // hydrating", and the store must not mistake it for a blank sketchbook.
    expect(db.peekDoc("default")).toBeUndefined();
  });

  it("says null once a namespace is known to be empty", async () => {
    const db = await loadDocDb();
    expect(await db.hydrateDoc("default")).toBeNull();
    expect(db.peekDoc("default")).toBeNull();
  });

  it("makes a write readable immediately, before the database has it", async () => {
    const db = await loadDocDb();
    db.putDoc("default", "{}", () => {});
    // Synchronously — a stroke must not wait on a transaction.
    expect(db.peekDoc("default")).toBe("{}");
    await db.flushDocWrites();
    expect(fake.records.get(KEY)).toBe("{}");
  });

  it("coalesces a burst of edits into the newest text", async () => {
    const db = await loadDocDb();
    for (const text of ["a", "b", "c"]) db.putDoc("default", text, () => {});
    await db.flushDocWrites();
    expect(fake.records.get(KEY)).toBe("c");
  });

  it("reports a write the database refused", async () => {
    const db = await loadDocDb();
    const errors: string[] = [];
    fake.failNextWrite = true;
    db.putDoc("default", "{}", (m) => errors.push(m));
    await db.flushDocWrites();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("may be full");
    // The work is still in hand, which is what the message promises.
    expect(db.peekDoc("default")).toBe("{}");
  });
});

describe("the move off localStorage", () => {
  it("adopts an existing document and frees the old key", async () => {
    const db = await loadDocDb();
    legacy.map.set(KEY, '{"drawings":[]}');
    expect(await db.hydrateDoc("default")).toBe('{"drawings":[]}');
    expect(fake.records.get(KEY)).toBe('{"drawings":[]}');
    // Freeing the 5 MB is the point of the exercise, not tidiness.
    expect(legacy.map.has(KEY)).toBe(false);
  });

  it("brings a quarantined copy across with it", async () => {
    const db = await loadDocDb();
    legacy.map.set(KEY, "live");
    legacy.map.set(`${KEY}:unreadable`, "held back");
    await db.hydrateDoc("default");
    expect(fake.records.get(`${KEY}:unreadable`)).toBe("held back");
    expect(legacy.map.has(`${KEY}:unreadable`)).toBe(false);
  });

  it("leaves the original in place when the copy fails", async () => {
    // A migration interrupted by a refused write must be a no-op, so the
    // previous build still finds the drawings exactly where it left them.
    const db = await loadDocDb();
    legacy.map.set(KEY, "precious");
    fake.failNextWrite = true;
    expect(await db.hydrateDoc("default")).toBe("precious");
    expect(legacy.map.get(KEY)).toBe("precious");
  });

  it("does not run again once the document is in the database", async () => {
    const db = await loadDocDb();
    fake.records.set(KEY, "current");
    legacy.map.set(KEY, "stale");
    expect(await db.hydrateDoc("default")).toBe("current");
    // The stale key is left alone rather than adopted — the database wins.
    expect(legacy.map.get(KEY)).toBe("stale");
  });

  it("falls back to localStorage when there is no database at all", async () => {
    // Firefox private windows, locked-down profiles: the app still runs, on
    // the old storage, rather than opening on a blank page.
    const db = await loadDocDb(false);
    legacy.map.set(KEY, "still here");
    expect(await db.hydrateDoc("default")).toBe("still here");
  });
});

describe("delivering to a namespace that isn't open", () => {
  it("confirms the write, and reads back past the cache", async () => {
    const db = await loadDocDb();
    expect(await db.putDocDurable("teaching", "moved")).toBe(true);
    expect(await db.readDocFresh("teaching")).toBe("moved");
  });

  it("reports a write that never landed", async () => {
    const db = await loadDocDb();
    fake.failNextWrite = true;
    expect(await db.putDocDurable("teaching", "moved")).toBe(false);
  });

  it("re-reads what another tab wrote, ignoring the cache", async () => {
    const db = await loadDocDb();
    await db.hydrateDoc("default");
    db.putDoc("default", "mine", () => {});
    await db.flushDocWrites();
    // Another tab writes underneath us.
    fake.records.set(KEY, "theirs");
    expect(db.peekDoc("default")).toBe("mine");
    expect(await db.readDocFresh("default")).toBe("theirs");
    expect(db.peekDoc("default")).toBe("theirs");
  });
});

describe("removing a sketchbook", () => {
  it("clears the record, the quarantine, and any legacy key", async () => {
    const db = await loadDocDb();
    fake.records.set(`${KEY}:teaching`, "doc");
    fake.records.set(`${KEY}:teaching:unreadable`, "held");
    legacy.map.set(`${KEY}:teaching`, "old");
    await db.deleteDoc("teaching");
    expect(fake.records.has(`${KEY}:teaching`)).toBe(false);
    expect(fake.records.has(`${KEY}:teaching:unreadable`)).toBe(false);
    expect(legacy.map.has(`${KEY}:teaching`)).toBe(false);
    expect(db.peekDoc("teaching")).toBeNull();
  });
});
