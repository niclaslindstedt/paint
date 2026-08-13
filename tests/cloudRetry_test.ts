// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { RateLimitError } from "@niclaslindstedt/oss-framework/storage";

import {
  MAX_MEDIA_ATTEMPTS,
  TransientHttpError,
  isTransientMediaError,
  mapLimit,
  withRetries,
} from "../src/app/cloudRetry.ts";

/** A logger that records what it was told, so a test can assert the retry was
 *  narrated rather than silent. */
function fakeLog() {
  const warnings: string[] = [];
  return {
    warnings,
    logger: {
      info: () => {},
      warn: (...args: unknown[]) => warnings.push(args.join(" ")),
      error: () => {},
    },
  };
}

/** A `wait` that records the delays it was asked for instead of sleeping. */
function fakeWait() {
  const delays: number[] = [];
  return {
    delays,
    wait: (ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    },
  };
}

describe("isTransientMediaError", () => {
  it("treats a provider throttle as worth retrying", () => {
    expect(isTransientMediaError(new RateLimitError(500))).toBe(true);
  });

  it("treats a 5xx as worth retrying", () => {
    expect(isTransientMediaError(new TransientHttpError(503, "nope"))).toBe(
      true,
    );
  });

  it.each([
    ["Load failed", "WebKit"],
    ["Failed to fetch", "Chromium"],
    ["NetworkError when attempting to fetch resource.", "Firefox"],
  ])("recognises %s as a dead connection (%s)", (message) => {
    expect(isTransientMediaError(new TypeError(message))).toBe(true);
  });

  it("does not retry a genuine failure", () => {
    expect(
      isTransientMediaError(new Error("Dropbox download failed: 404")),
    ).toBe(false);
  });

  it("does not retry a programming TypeError", () => {
    expect(isTransientMediaError(new TypeError("x is not a function"))).toBe(
      false,
    );
  });
});

describe("withRetries", () => {
  it("returns the first successful result without waiting", async () => {
    const { logger } = fakeLog();
    const { wait, delays } = fakeWait();
    const result = await withRetries(
      "read",
      () => Promise.resolve(7),
      logger,
      wait,
    );
    expect(result).toBe(7);
    expect(delays).toEqual([]);
  });

  it("waits exactly as long as a throttle asked, then succeeds", async () => {
    const { logger, warnings } = fakeLog();
    const { wait, delays } = fakeWait();
    let calls = 0;
    const value = await withRetries(
      "read images/sketch-1a2b-1.png",
      () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new RateLimitError(1500));
        return Promise.resolve("bytes");
      },
      logger,
      wait,
    );
    expect(value).toBe("bytes");
    expect(delays).toEqual([1500]);
    expect(warnings[0]).toContain("images/sketch-1a2b-1.png");
  });

  it("retries a WebKit 'Load failed' with a backoff", async () => {
    const { logger } = fakeLog();
    const { wait, delays } = fakeWait();
    let calls = 0;
    await withRetries(
      "read",
      () => {
        calls += 1;
        if (calls < 3) return Promise.reject(new TypeError("Load failed"));
        return Promise.resolve(null);
      },
      logger,
      wait,
    );
    expect(calls).toBe(3);
    expect(delays).toHaveLength(2);
    expect(delays.every((d) => d > 0)).toBe(true);
  });

  it("gives up after the attempt budget and rethrows the last failure", async () => {
    const { logger } = fakeLog();
    const { wait, delays } = fakeWait();
    let calls = 0;
    await expect(
      withRetries(
        "read",
        () => {
          calls += 1;
          return Promise.reject(new TypeError("Load failed"));
        },
        logger,
        wait,
      ),
    ).rejects.toThrow("Load failed");
    expect(calls).toBe(MAX_MEDIA_ATTEMPTS);
    expect(delays).toHaveLength(MAX_MEDIA_ATTEMPTS - 1);
  });

  it("surfaces a non-transient failure immediately", async () => {
    const { logger } = fakeLog();
    const { wait, delays } = fakeWait();
    let calls = 0;
    await expect(
      withRetries(
        "read",
        () => {
          calls += 1;
          return Promise.reject(new Error("Dropbox download failed: 404"));
        },
        logger,
        wait,
      ),
    ).rejects.toThrow("404");
    expect(calls).toBe(1);
    expect(delays).toEqual([]);
  });

  it("clamps an absurd Retry-After rather than sleeping for minutes", async () => {
    const { logger } = fakeLog();
    const { wait, delays } = fakeWait();
    let calls = 0;
    await withRetries(
      "read",
      () => {
        calls += 1;
        if (calls === 1) return Promise.reject(new RateLimitError(600_000));
        return Promise.resolve(null);
      },
      logger,
      wait,
    );
    expect(delays[0]).toBeLessThanOrEqual(30_000);
  });
});

describe("mapLimit", () => {
  it("keeps results in input order", async () => {
    const out = await mapLimit([1, 2, 3, 4, 5], 2, async (n) => {
      await Promise.resolve();
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("never has more than `limit` calls in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const items = Array.from({ length: 50 }, (_, i) => i);
    await mapLimit(items, 4, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      // Yield a few times so the scheduler really does interleave the workers.
      await Promise.resolve();
      await Promise.resolve();
      inFlight -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it("handles an empty list", async () => {
    expect(await mapLimit([], 4, () => Promise.resolve(1))).toEqual([]);
  });
});
