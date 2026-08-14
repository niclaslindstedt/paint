// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Binary image transport for the cloud backends. The framework's `FileStore` is
// text-only — its `read` does `res.text()` and its `write` sends the string as
// the body — so it can round-trip a base64 string but not raw image bytes: a
// JPEG pushed through it comes back mangled by UTF-8 decoding. This module talks
// to the Dropbox and Google Drive content APIs directly to move *bytes*, so what
// lands on the drive is a genuine `.jpg` / `.png` you can preview, not a base64
// blob.
//
// It leans on the framework's proven text `FileStore` for the metadata-only
// operations that never touch a body (`list`, `remove`) — reusing its Dropbox
// token-refresh and Drive folder-resolution — and only re-implements the two
// operations that carry image bytes (`read`, `write`). The result is the small
// {@link ByteFileStore} contract the externaliser (see `imageStore.ts`) drives,
// and which `folderFileStore.ts` satisfies for the picked local directory.
//
// Every operation is wrapped in the shared media retry (`cloudRetry.ts`), so a
// `429 Too Many Requests` is waited out for exactly as long as the provider's
// `Retry-After` asks and a browser-level "the request never left" rejection
// (WebKit's `Load failed`) is backed off through. Without that a throttled image
// read looks exactly like a missing file to the layer above — and a throttled
// *write* looks like a picture that no longer wants its file.

import {
  AuthError,
  RateLimitError,
  bearerAuthHeader,
  createDropboxFileStore,
  createGdriveFileStore,
  dropboxApiArg,
  parseRetryAfterMs,
  readErrorBody,
  refreshDropboxAccessToken,
  type DropboxAuth,
  type FileStore,
  type Logger,
} from "@niclaslindstedt/oss-framework/storage";

import { TransientHttpError, withRetries } from "./cloudRetry.ts";
import { logStore } from "./log.ts";

/** A byte-level file store: the same shape as the framework's `FileStore` but
 *  `read`/`write` deal in raw bytes rather than text, so an image file stays
 *  binary end to end. `write` takes the MIME type the bytes are, so a filed PNG
 *  lands as a PNG rather than being announced as something else; it defaults to
 *  `image/png`, which is what a canvas re-encode produces unless the import was
 *  a photo. */
export type ByteFileStore = {
  list(): Promise<string[]>;
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array, mime?: string): Promise<void>;
  remove(path: string): Promise<void>;
};

const DROPBOX_UPLOAD = "https://content.dropboxapi.com/2/files/upload";
const DROPBOX_DOWNLOAD = "https://content.dropboxapi.com/2/files/download";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const PNG_MIME = "image/png";

/** How long to wait out a throttle that arrives without a usable `Retry-After`.
 *  Matches the framework's own document-adapter fallback. */
const RATE_LIMIT_FALLBACK_MS = 2_000;

/** Turn a failed content-API response into the right *kind* of error, so the
 *  retry layer can tell a recoverable throttle or service blip from a genuine
 *  failure. A `429` becomes the framework's `RateLimitError` carrying the
 *  provider's own `Retry-After`; a `5xx` becomes a {@link TransientHttpError};
 *  anything else is a plain `Error` nobody should retry. */
function statusError(provider: string, op: string, res: Response): Error {
  const label = `${provider} ${op} failed: ${res.status}`;
  if (res.status === 429) {
    return new RateLimitError(
      parseRetryAfterMs(res.headers, RATE_LIMIT_FALLBACK_MS),
    );
  }
  if (res.status >= 500) return new TransientHttpError(res.status, label);
  return new Error(label);
}

/** Wrap every operation of a byte store in {@link withRetries}, so a throttle or
 *  a browser-level "the request never left" failure is waited out rather than
 *  reported to the externaliser as an unreadable / unwritable file. This is the
 *  seam that keeps a transient blip from being mistaken for a missing image. */
function retrying(store: ByteFileStore, log: Logger): ByteFileStore {
  return {
    list: () => withRetries("list", () => store.list(), log),
    read: (path) => withRetries(`read ${path}`, () => store.read(path), log),
    write: (path, bytes, mime) =>
      withRetries(`write ${path}`, () => store.write(path, bytes, mime), log),
    remove: (path) =>
      withRetries(`remove ${path}`, () => store.remove(path), log),
  };
}

// --- Dropbox -----------------------------------------------------------------

/** A binary Dropbox byte store rooted at the app folder. `list`/`remove` reuse
 *  the framework's text store (no body to corrupt); `read`/`write` move bytes
 *  through the content API, refreshing the access token on a 401 the same way
 *  the framework's own store does. */
export function dropboxByteFileStore(
  auth: DropboxAuth,
  appKey: string | undefined,
): ByteFileStore {
  const log = logStore.createLogger("dropbox");
  const meta: FileStore = createDropboxFileStore(auth, { appKey, logger: log });
  let token = auth.accessToken;

  // Run a content request, refreshing the token once on a 401 (mirrors the
  // framework's `createAuthedFetch`). Returns the final response.
  async function authed(
    url: string,
    build: (token: string) => RequestInit,
  ): Promise<Response> {
    let res = await fetch(url, build(token));
    if (res.status === 401 && auth.refreshToken && appKey) {
      token = await refreshDropboxAccessToken(appKey, auth.refreshToken);
      auth.onAccessTokenRefreshed(token);
      res = await fetch(url, build(token));
    }
    return res;
  }

  return retrying(
    {
      list: () => meta.list().then((e) => e.map((f) => f.path)),
      remove: (path) => meta.remove(path),
      async read(path) {
        const res = await authed(DROPBOX_DOWNLOAD, (t) => ({
          method: "POST",
          headers: {
            ...bearerAuthHeader(t),
            "Dropbox-API-Arg": dropboxApiArg({ path: `/${path}` }),
          },
        }));
        if (res.status === 409) return null; // path/not_found
        if (!res.ok) throw statusError("Dropbox", "download", res);
        return new Uint8Array(await res.arrayBuffer());
      },
      // Dropbox stores the bytes verbatim and infers the type from the path's
      // extension, so the upload body is always octet-stream — the `mime` hint
      // is unused here (it matters only for the Drive content type).
      async write(path, bytes) {
        const res = await authed(DROPBOX_UPLOAD, (t) => ({
          method: "POST",
          headers: {
            ...bearerAuthHeader(t),
            "Dropbox-API-Arg": dropboxApiArg({
              path: `/${path}`,
              mode: "overwrite",
              mute: true,
            }),
            "Content-Type": "application/octet-stream",
          },
          body: bytes as BodyInit,
        }));
        if (!res.ok) throw statusError("Dropbox", "upload", res);
      },
    },
    log,
  );
}

// --- Google Drive ------------------------------------------------------------

/** A binary Google Drive byte store inside the app folder. `list`/`remove` reuse
 *  the framework's text store (folder resolution and all); `read`/`write` move
 *  bytes through the media-upload endpoint. `appFolderName` is the My Drive
 *  folder the app files everything under — the same one the document adapter is
 *  given, so the images land beside the document rather than in a folder of
 *  their own. */
export function gdriveByteFileStore(
  token: string,
  appFolderName: string,
): ByteFileStore {
  const log = logStore.createLogger("gdrive");
  const meta: FileStore = createGdriveFileStore(token, {
    appFolderName,
    logger: log,
  });
  const auth = () => bearerAuthHeader(token);
  const dirIds = new Map<string, string>();

  async function searchOne(query: string): Promise<string | null> {
    const url = `${DRIVE_FILES}?q=${encodeURIComponent(query)}&spaces=drive&fields=files(id)`;
    const res = await fetch(url, { headers: auth() });
    if (!res.ok) throw await driveError("search", res);
    const json = (await res.json()) as { files?: { id: string }[] };
    return json.files?.[0]?.id ?? null;
  }

  async function createFolder(
    name: string,
    parentId: string | null,
  ): Promise<string> {
    const body: { name: string; mimeType: string; parents?: string[] } = {
      name,
      mimeType: FOLDER_MIME,
    };
    if (parentId) body.parents = [parentId];
    const res = await fetch(`${DRIVE_FILES}?fields=id`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await driveError("folder", res);
    return ((await res.json()) as { id: string }).id;
  }

  // Resolve (creating when asked) the id of a folder path under the app folder.
  async function resolveDir(
    relDir: string,
    create: boolean,
  ): Promise<string | null> {
    const cached = dirIds.get(relDir);
    if (cached) return cached;
    let appId = await searchOne(
      `name='${appFolderName}' and mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`,
    );
    if (!appId) {
      if (!create) return null;
      appId = await createFolder(appFolderName, null);
    }
    let parentId = appId;
    for (const seg of relDir.split("/").filter(Boolean)) {
      let id = await searchOne(
        `name='${seg}' and mimeType='${FOLDER_MIME}' and '${parentId}' in parents and trashed=false`,
      );
      if (!id) {
        if (!create) return null;
        id = await createFolder(seg, parentId);
      }
      parentId = id;
    }
    dirIds.set(relDir, parentId);
    return parentId;
  }

  function split(path: string): { dir: string; name: string } {
    const i = path.lastIndexOf("/");
    return i === -1
      ? { dir: "", name: path }
      : { dir: path.slice(0, i), name: path.slice(i + 1) };
  }

  async function fileId(path: string): Promise<string | null> {
    const { dir, name } = split(path);
    const dirId = await resolveDir(dir, false);
    if (!dirId) return null;
    return searchOne(
      `name='${name}' and '${dirId}' in parents and trashed=false`,
    );
  }

  return retrying(
    {
      list: () => meta.list().then((e) => e.map((f) => f.path)),
      remove: (path) => meta.remove(path),
      read,
      write,
    },
    log,
  );

  async function read(path: string): Promise<Uint8Array | null> {
    const id = await fileId(path);
    if (!id) return null;
    const res = await fetch(`${DRIVE_FILES}/${id}?alt=media`, {
      headers: auth(),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw await driveError("download", res);
    return new Uint8Array(await res.arrayBuffer());
  }

  async function write(
    path: string,
    bytes: Uint8Array,
    mime?: string,
  ): Promise<void> {
    const { dir, name } = split(path);
    const dirId = await resolveDir(dir, true);
    if (!dirId) throw new Error(`Google Drive: cannot resolve ${dir}`);
    const existing = await searchOne(
      `name='${name}' and '${dirId}' in parents and trashed=false`,
    );
    // Upload the raw bytes: PATCH an existing file's media, or create the file
    // (metadata first, so it lands with the right name/parent) then its media.
    const id = existing ?? (await createEmpty(dirId, name));
    const res = await fetch(`${DRIVE_UPLOAD}/${id}?uploadType=media`, {
      method: "PATCH",
      headers: { ...auth(), "Content-Type": mime ?? PNG_MIME },
      body: bytes as BodyInit,
    });
    if (!res.ok) throw await driveError("upload", res);
  }

  async function createEmpty(parentId: string, name: string): Promise<string> {
    const res = await fetch(`${DRIVE_FILES}?fields=id`, {
      method: "POST",
      headers: { ...auth(), "Content-Type": "application/json" },
      body: JSON.stringify({ name, parents: [parentId] }),
    });
    if (!res.ok) throw await driveError("create", res);
    return ((await res.json()) as { id: string }).id;
  }

  // A 401 is the reconnect signal; a 429 / 5xx is worth waiting out (see
  // `statusError`); anything else is a genuine failure, reported with the
  // provider's own body so the log names the cause.
  async function driveError(op: string, res: Response): Promise<Error> {
    if (res.status === 401) {
      return new AuthError(
        `Google Drive ${op} failed: 401 ${await readErrorBody(res)}`,
      );
    }
    if (res.status === 429 || res.status >= 500) {
      return statusError("Google Drive", op, res);
    }
    return new Error(
      `Google Drive ${op} failed: ${res.status} ${await readErrorBody(res)}`,
    );
  }
}
