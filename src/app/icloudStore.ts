// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The two file stores the iCLOUD BACKEND is built from, over a host that
// offers the capability (`icloudHost.ts`).
//
// iCloud Drive is a folder, not a service with an API, so this backend is the
// picked-local-folder backend with a different transport underneath — and it
// is deliberately built that way. The framework's `createFileStoreAdapter`
// turns the text store below into the whole-document `StorageAdapter`, and the
// byte store satisfies the same `ByteFileStore` contract the Dropbox and folder
// transports do, so the image externaliser, the layer save and the settings
// file all drive it unchanged.
//
// Everything is filed under the container's document root, so what lands in
// iCloud Drive is a browsable tree — `paint-<slug>.json` with `images/`,
// `drawings/` and `settings.json` beside it — that the reader can open in the
// Files app on any of their devices.
//
// WHAT THIS LAYER OWNS is one conversion and one policy:
//
//   • BASE64. The bridge to a host is a string channel, so image bytes cross
//     as base64 and are decoded here. Text does not: the document is JSON and
//     crosses as itself.
//   • NO RETRIES. A host reads a folder on the device's own disk; iCloud's
//     syncing happens underneath it, on its own schedule, and a read that
//     failed will not succeed a moment later for a reason a retry could
//     reach. So the adapter is built with the retry schedule off, exactly as
//     the local folder backend is.

import {
  createFileStoreAdapter,
  type FileStore,
  type StorageAdapter,
  type StorageBackendId,
} from "@niclaslindstedt/oss-framework/storage";

import type { ICloudHost } from "./icloudHost.ts";
import { parseICloudEntries } from "./icloudHost.ts";
import type { ByteFileStore } from "./imageFileStore.ts";
import { logStore } from "./log.ts";

const log = logStore.createLogger("icloud");

/** The backend's stable identifier, used to label the adapter.
 *
 *  The framework's `StorageBackendId` is the closed union of the backends it
 *  ships, while its own documentation says an app that adds a backend "keys it
 *  under its own string" — so the cast is the type catching up with the
 *  contract, not a hole in it. Spelled once, here. */
export const ICLOUD_BACKEND_ID = "icloud" as StorageBackendId;

// --- the document store ------------------------------------------------------

/** The text-level {@link FileStore} the whole-document adapter is built on.
 *  Paths are `/`-separated and relative to the container's document root. */
export function icloudFileStore(host: ICloudHost): FileStore {
  return {
    async list() {
      return parseICloudEntries(await host.list());
    },
    read: (path) => host.read(path),
    write: (path, text) => host.write(path, text),
    remove: (path) => host.remove(path),
  };
}

/** The whole-document adapter: `paint-<slug>.json` in the container's document
 *  root, beside the `images/` and `drawings/` trees. */
export function createICloudAdapter(
  host: ICloudHost,
  fileName: string,
): StorageAdapter {
  return createFileStoreAdapter(icloudFileStore(host), {
    id: ICLOUD_BACKEND_ID,
    label: "iCloud Drive",
    fileName,
    logger: log,
    // See the header: the transport is a local folder, so there is no network
    // error for a retry to ride out.
    retryDelaysMs: [],
  });
}

// --- the byte store ----------------------------------------------------------

/** The byte-level {@link ByteFileStore} the image, layer and settings layers
 *  drive — the same contract the Dropbox and folder transports satisfy, so all
 *  three are interchangeable.
 *
 *  `mime` is accepted and ignored: a file in iCloud Drive carries its type in
 *  its extension, exactly as one in a picked folder does, and the paths the
 *  callers compose already end in `.png` / `.jpg` / `.json`. */
export function icloudByteFileStore(host: ICloudHost): ByteFileStore {
  return {
    async list() {
      return parseICloudEntries(await host.list()).map((entry) => entry.path);
    },
    async read(path) {
      const base64 = await host.readBytes(path);
      return base64 === null ? null : base64ToBytes(base64);
    },
    async write(path, bytes) {
      await host.writeBytes(path, bytesToBase64(bytes));
    },
    remove: (path) => host.remove(path),
  };
}

// --- base64 ------------------------------------------------------------------
//
// `btoa` / `atob` are the browser's own, and the only base64 a page has. They
// work on binary strings, so bytes are chunked through `String.fromCharCode`
// rather than spread in one call: a rendered layer runs to a few million
// bytes, and spreading that many arguments overflows the call stack.

const CHUNK = 0x8000;

/** Base64 for a byte array. Exported for the tests that pin the round trip. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** The bytes a base64 string holds. Exported alongside its inverse. */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
