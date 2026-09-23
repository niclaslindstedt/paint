// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The iCloud backend's own small state, kept out of `useSyncEngine` so the
// engine only ever sees "here is a host, and here is whether it can be used".
//
// Two things need tracking that none of the other backends need:
//
//   • WHETHER A HOST IS THERE AT ALL. It arrives from outside the bundle (see
//     `icloudHost.ts`) and can install itself either side of the app's first
//     render, so it is state, not a constant.
//   • WHETHER THE CONTAINER IS USABLE. Unlike an OAuth token, which is either
//     in hand or not, an iCloud container is present in the build and still
//     unreachable when the device is not signed in to iCloud — and the reader
//     can fix that from iOS Settings without the app ever being restarted. So
//     the status is probed on mount and re-probed on demand, and `signed-out`
//     is a state the command centre can offer to re-check rather than a dead
//     end.
//
// Nothing here reads or writes a file. The stores are built in
// `icloudStore.ts`; this module only decides whether they may be.

import { useCallback, useEffect, useState } from "react";

import {
  parseICloudStatus,
  useICloudHost,
  type ICloudHost,
  type ICloudStatus,
} from "./icloudHost.ts";
import { logStore } from "./log.ts";

const log = logStore.createLogger("icloud");

export type ICloudBackend = {
  /** The installed host, or null where none is offered (every browser). */
  host: ICloudHost | null;
  /** Whether the container is usable. `unavailable` until the first probe has
   *  answered, so a backend that turns out not to exist is never briefly
   *  offered and then withdrawn. */
  status: ICloudStatus;
  /** Re-ask the host. The reader may have signed in to iCloud since the last
   *  answer — which is exactly what the command centre's "Reconnect" is for. */
  refresh: () => Promise<ICloudStatus>;
};

export function useICloudBackend(): ICloudBackend {
  const host = useICloudHost();
  const [status, setStatus] = useState<ICloudStatus>("unavailable");

  const probe = useCallback(
    async (current: ICloudHost | null): Promise<ICloudStatus> => {
      if (!current) return "unavailable";
      try {
        return parseICloudStatus(await current.status());
      } catch (err) {
        // A host that throws on the cheapest call it has is not one to build a
        // backend on. Treated as signed-out rather than unavailable so the
        // reader can still re-check it.
        log.warn(
          `status: probe failed — ${err instanceof Error ? err.message : String(err)}`,
        );
        return "signed-out";
      }
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const answer = await probe(host);
      if (cancelled) return;
      setStatus(answer);
      if (host) log.info(`status: ${answer}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [host, probe]);

  const refresh = useCallback(async () => {
    const answer = await probe(host);
    setStatus(answer);
    log.info(`status: re-probed — ${answer}`);
    return answer;
  }, [host, probe]);

  return { host, status, refresh };
}
