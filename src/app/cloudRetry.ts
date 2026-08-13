// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Politeness for the image byte transports (`imageFileStore.ts`,
// `folderFileStore.ts`, and through them the image externaliser in
// `imageStore.ts`).
//
// The document itself is one small request per save, so the framework's storage
// adapters can be blunt about it. Bitmaps are the opposite shape: a sketchbook
// with a photo dropped on every page wants one content-API round-trip per
// picture, and a naive `Promise.all` fires every one at once. Two things go
// wrong at that fan-out:
//
//   - **The provider throttles.** Dropbox answers `429 Too Many Requests` with a
//     `Retry-After`, which nothing in a byte transport reads by default — the
//     request simply fails and the image goes missing.
//   - **The browser gives up.** Beyond its per-host connection budget the fetch
//     is rejected outright with a bare `TypeError` whose wording is
//     engine-specific: WebKit says `Load failed`, Chromium `Failed to fetch`,
//     Firefox `NetworkError when attempting to fetch resource`. Nothing is wrong
//     with the file — the request never left.
//
// So this module supplies the two things that make an image sweep survive a real
// network: {@link mapLimit}, which keeps only a handful of files in flight at a
// time (the throttling is largely *self*-inflicted, so this is the actual fix),
// and {@link withRetries}, which honours a `Retry-After` and backs off through a
// transient failure instead of reporting the picture as unreadable.

import {
  RateLimitError,
  backoffDelayMs,
  type Logger,
} from "@niclaslindstedt/oss-framework/storage";

/** How many image files one sweep keeps in flight at once. Low on purpose: the
 *  cloud providers throttle per app *and* per user, and a browser only opens a
 *  handful of connections per host anyway — queueing beyond that buys no
 *  throughput and is what turns a picture-heavy sketchbook into a 429 storm. */
export const MEDIA_CONCURRENCY = 4;

/** Attempts (the first try plus its retries) any one image op gets. */
export const MAX_MEDIA_ATTEMPTS = 5;

/** Ceiling on a single wait, so a hostile or mistaken `Retry-After` can't wedge
 *  a save for minutes. */
const MAX_WAIT_MS = 30_000;

/** The engine-specific wording a browser uses when a `fetch` never completed.
 *  Matched (rather than trusting `TypeError` alone) so a genuine programming
 *  `TypeError` isn't retried five times before surfacing. */
const NETWORK_FAILURE =
  /load failed|failed to fetch|networkerror|network request failed|connection|aborted|timed out/i;

/** An HTTP status the provider is expected to recover from on its own — a 5xx.
 *  Distinct from a plain `Error` so {@link withRetries} can tell "the service
 *  hiccuped" from "this path is wrong". */
export class TransientHttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TransientHttpError";
    this.status = status;
  }
}

/** Whether a failure is worth trying again: a provider throttle, a 5xx, or the
 *  browser refusing to make the request at all. Anything else — a 404, a bad
 *  path, a bug — is reported as-is rather than retried. */
export function isTransientMediaError(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  if (err instanceof TransientHttpError) return true;
  return err instanceof TypeError && NETWORK_FAILURE.test(err.message);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Run `op`, retrying it through a throttle or a transient network failure.
 *  A `RateLimitError` waits exactly as long as the provider asked (clamped);
 *  everything else backs off exponentially. Gives up after
 *  {@link MAX_MEDIA_ATTEMPTS} and rethrows the last failure, so the caller's
 *  existing "keep it inline / leave it unread" handling still applies — this
 *  only stops a *recoverable* blip from being treated as a lost file.
 *
 *  `wait` is injectable so tests don't spend real seconds asleep. */
export async function withRetries<T>(
  label: string,
  op: () => Promise<T>,
  log: Logger,
  wait: (ms: number) => Promise<void> = sleep,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await op();
    } catch (err) {
      if (attempt + 1 >= MAX_MEDIA_ATTEMPTS || !isTransientMediaError(err)) {
        throw err;
      }
      const asked =
        err instanceof RateLimitError
          ? err.retryAfterMs
          : backoffDelayMs(attempt);
      const delay = Math.min(Math.max(0, asked), MAX_WAIT_MS);
      log.warn(
        `${label}: ${errMsg(err)} — retrying in ${Math.round(delay)}ms ` +
          `(attempt ${attempt + 2}/${MAX_MEDIA_ATTEMPTS})`,
      );
      await wait(delay);
    }
  }
}

/** `items.map(fn)` with at most `limit` calls in flight, results in input order.
 *  `fn` is expected to handle its own failures — a rejection propagates and the
 *  remaining workers are left running, so callers pass a `fn` that never throws. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const i = next;
        next += 1;
        if (i >= items.length) return;
        out[i] = await fn(items[i]!, i);
      }
    }),
  );
  return out;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
