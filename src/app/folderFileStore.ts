// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Binary file transport for the local-folder backend. The framework's folder
// adapter stores the *document* as one JSON file under the picked directory;
// this module is the byte-level companion that files each dropped bitmap out as
// a real image file beside it (`images/…`) — so a picked folder is a browsable,
// git-trackable tree of genuine `.png` / `.jpg` files, not one JSON blob with
// base64 inside.
//
// It talks to the File System Access API directly (`getFileHandle`,
// `createWritable`, `getFile`), so bytes round-trip verbatim — the same
// {@link ByteFileStore} contract the Dropbox / Drive transports satisfy in
// `imageFileStore.ts`, letting the image externaliser (`imageStore.ts`) drive
// all three interchangeably. The local folder never touches the network, so
// there are no auth or rate-limit paths here; a revoked OS grant surfaces as a
// `NotAllowedError` the caller turns into a "Reconnect folder" cue.

import { logStore } from "./log.ts";
import type { ByteFileStore } from "./imageFileStore.ts";

const log = logStore.createLogger("folder");

function isNotFoundError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "NotFoundError";
}

/** True when the OS revoked the directory grant mid-operation. Chrome reports it
 *  as `NotAllowedError` / `SecurityError`; the caller flips to the reconnect cue
 *  when it sees one. */
export function isFolderPermissionError(err: unknown): boolean {
  if (!(err instanceof DOMException)) return false;
  return err.name === "NotAllowedError" || err.name === "SecurityError";
}

/** Build the byte-level {@link ByteFileStore} for a picked directory handle.
 *  Paths are `/`-separated and resolve relative to the picked root (so an image
 *  lands at `<picked>/images/<name>.png`), matching the cloud transports'
 *  layout. `onPermissionLost` fires once when an operation hits a revoked grant,
 *  so the sync engine can drop the handle and surface a reconnect banner. */
export function folderFileStore(
  root: FileSystemDirectoryHandle,
  onPermissionLost?: () => void,
): ByteFileStore {
  function reportPermission(err: unknown): void {
    if (isFolderPermissionError(err)) {
      log.warn("folder: permission lost during operation");
      onPermissionLost?.();
    }
  }

  // Resolve the directory handle for a list of path segments, optionally
  // creating each. Returns null when a segment is missing and `create` is false.
  async function resolveDir(
    segments: string[],
    create: boolean,
  ): Promise<FileSystemDirectoryHandle | null> {
    let dir = root;
    for (const segment of segments) {
      try {
        dir = await dir.getDirectoryHandle(segment, { create });
      } catch (err) {
        if (isNotFoundError(err)) return null;
        reportPermission(err);
        throw err;
      }
    }
    return dir;
  }

  // Split a path into its parent directory (resolved) and the leaf file name.
  async function resolveParent(
    path: string,
    create: boolean,
  ): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
    const segments = path.split("/").filter((s) => s.length > 0);
    const name = segments.pop();
    if (!name) return null;
    const dir = await resolveDir(segments, create);
    return dir ? { dir, name } : null;
  }

  async function walk(
    dir: FileSystemDirectoryHandle,
    prefix: string,
    out: string[],
  ): Promise<void> {
    try {
      for await (const handle of dir.values()) {
        const path = prefix ? `${prefix}/${handle.name}` : handle.name;
        if (handle.kind === "directory") {
          await walk(handle, path, out);
        } else {
          out.push(path);
        }
      }
    } catch (err) {
      reportPermission(err);
      throw err;
    }
  }

  return {
    async list() {
      const out: string[] = [];
      await walk(root, "", out);
      return out;
    },
    async read(path) {
      const parent = await resolveParent(path, false);
      if (!parent) return null;
      try {
        const handle = await parent.dir.getFileHandle(parent.name, {
          create: false,
        });
        const file = await handle.getFile();
        return new Uint8Array(await file.arrayBuffer());
      } catch (err) {
        if (isNotFoundError(err)) return null;
        reportPermission(err);
        throw err;
      }
    },
    // The local folder stores the raw bytes verbatim and browsers infer the type
    // from the file extension, so the `mime` hint is unused here (it matters
    // only for the Drive content type).
    async write(path, bytes) {
      const parent = await resolveParent(path, true);
      if (!parent) throw new Error(`folder: cannot resolve ${path}`);
      try {
        const handle = await parent.dir.getFileHandle(parent.name, {
          create: true,
        });
        const writable = await handle.createWritable({
          keepExistingData: false,
        });
        await writable.write(bytes as BufferSource);
        await writable.close();
      } catch (err) {
        reportPermission(err);
        throw err;
      }
    },
    async remove(path) {
      const parent = await resolveParent(path, false);
      if (!parent) return;
      try {
        await parent.dir.removeEntry(parent.name);
      } catch (err) {
        if (isNotFoundError(err)) return;
        reportPermission(err);
        throw err;
      }
    },
  };
}
