// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The second save: filing a sketchbook's *rendered layers* out to the backend
// as a `.pct` tree (see `layerStore.ts`), driven by the header's disk button.
//
// It lives beside `useSyncEngine` rather than inside it because it is genuinely
// a different mechanism, not a variant of the document push. It moves bytes on
// its own schedule (never a timer), through its own transport (raw files, not
// the document adapter), and it deliberately does **not** touch the revision
// the next document push is based on — a layer save must never be able to
// provoke a conflict on the strokes.
//
// The engine composes it and spreads the result, so a caller sees one `sync`
// object with both saves on it.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DropboxAuth } from "@niclaslindstedt/oss-framework/storage";

import { canSaveLayers } from "./cloudSetup.ts";
import { folderFileStore } from "./folderFileStore.ts";
import {
  dropboxByteFileStore,
  gdriveByteFileStore,
  type ByteFileStore,
} from "./imageFileStore.ts";
import { logStore } from "./log.ts";
import type { InkContext } from "./render.ts";
import type { AppData } from "./types.ts";

const log = logStore.createLogger("layers");

/** Which backend's files to write, and what it takes to reach them. Built by
 *  the engine from its live credentials; `null` means there is nowhere to file
 *  layers (the on-device sketchbook, a disconnected backend, or an encrypted
 *  one — see below). */
export type LayerBackend =
  | { kind: "dropbox"; auth: DropboxAuth; appKey: string | undefined }
  | { kind: "gdrive"; token: string; appFolder: string }
  | {
      kind: "folder";
      handle: FileSystemDirectoryHandle;
      onPermissionLost: () => void;
    }
  | null;

/** Everything about the engine's state that decides whether a save may run.
 *  Mirrors the document push's gate minus `dirty`, plus `encrypted` — see
 *  `cloudSetup.ts`'s `LayerSaveGate` for why those two differ. */
export type LayerSaveConditions = {
  isRemote: boolean;
  connected: boolean;
  blocked: boolean;
  locked: boolean;
  encrypted: boolean;
  pendingSetup: boolean;
  baselineReady: boolean;
};

export type LayerSave = {
  canSaveLayers: boolean;
  layersDirty: boolean;
  layerStatus: "idle" | "saving" | "saved" | "error";
  saveLayers: (ink: InkContext) => void;
};

/** The live credentials the engine holds, in the shape this module can pick a
 *  backend out of. */
export type LayerCredentials = {
  backend: "local" | "folder" | "dropbox" | "gdrive";
  dropbox: { auth: DropboxAuth; appKey: string | undefined } | null;
  gdrive: { token: string; appFolder: string } | null;
  folder: {
    handle: FileSystemDirectoryHandle;
    onPermissionLost: () => void;
  } | null;
};

/** Which backend to file layers through, given what is connected. Pure, so the
 *  engine can memo it without knowing what a byte store is. */
export function layerBackendFor(creds: LayerCredentials): LayerBackend {
  if (creds.backend === "dropbox" && creds.dropbox) {
    return { kind: "dropbox", ...creds.dropbox };
  }
  if (creds.backend === "gdrive" && creds.gdrive) {
    return { kind: "gdrive", ...creds.gdrive };
  }
  if (creds.backend === "folder" && creds.folder) {
    return { kind: "folder", ...creds.folder };
  }
  return null;
}

/** Build the byte transport for a backend. The same three stores the dropped
 *  bitmaps ride (`imageStore.ts`), unscoped here — `layerStore.ts` narrows them
 *  to the `drawings/` tree at save time. */
function transportFor(backend: LayerBackend): ByteFileStore | null {
  if (!backend) return null;
  if (backend.kind === "dropbox") {
    return dropboxByteFileStore(backend.auth, backend.appKey);
  }
  if (backend.kind === "gdrive") {
    return gdriveByteFileStore(backend.token, backend.appFolder);
  }
  return folderFileStore(backend.handle, backend.onPermissionLost);
}

/**
 * The disk button's state and action.
 *
 * `doc` and `version` come from the store: the document is read at save time
 * (through a ref, so the callback doesn't churn on every mark) and the version
 * is what "saved" is remembered against.
 */
export function useLayerSave(
  backend: LayerBackend,
  conditions: LayerSaveConditions,
  doc: { readonly current: AppData },
  version: number,
): LayerSave {
  // The edit counter at the last successful save, or null for "not this
  // session". Null rather than the current version on purpose: a freshly opened
  // app has no idea what the backend's `drawings/` tree holds, and a button
  // that started dark would tell the user their layers are filed when they may
  // never have been.
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [layerStatus, setLayerStatus] =
    useState<LayerSave["layerStatus"]>("idle");

  // Null while encrypted, which is the enforcement half of the rule
  // `canSaveLayers` states: there is no store to write plaintext PNGs through,
  // so a bug in the gate can't leak them either.
  const files = useMemo(
    () => (conditions.encrypted ? null : transportFor(backend)),
    [backend, conditions.encrypted],
  );

  const allowed =
    canSaveLayers({ ...conditions, saving: layerStatus === "saving" }) &&
    files !== null;
  const layersDirty = savedVersion === null || version !== savedVersion;

  // Anything that changes *which* backend we are pointed at invalidates what we
  // believe about its layer tree — a different Dropbox account, a different
  // folder, or the same one re-locked. Back to "we don't know", which reads as
  // dirty.
  useEffect(() => {
    setSavedVersion(null);
    setLayerStatus("idle");
  }, [files]);

  const inFlight = useRef(false);
  const versionRef = useRef(version);
  versionRef.current = version;

  const saveLayers = useCallback(
    (ink: InkContext) => {
      if (!allowed || !files || inFlight.current) return;
      inFlight.current = true;
      setLayerStatus("saving");
      const at = versionRef.current;
      void (async () => {
        try {
          // Loaded on demand: the container, the zip codec and the layer
          // renderer are a user action away, not a first-paint concern, and the
          // sync engine that composes this hook is on the entry path.
          const [
            { planLayerSave, runLayerSave, scopeToDrawings },
            { renderLayer },
          ] = await Promise.all([
            import("./layerStore.ts"),
            import("./pctFile.ts"),
          ]);
          const store = scopeToDrawings(files);
          // Archived drawings are shelved, not deleted — but a shelf is not
          // worth a megabyte of PNGs, and restoring one files it on the next
          // save.
          const drawings = doc.current.drawings.filter((d) => !d.archived);
          const plan = planLayerSave(drawings, await store.list(), ink);
          log.info(
            `plan: ${plan.writes.length} to render, ${plan.manifests.length} manifest(s), ${plan.prune.length} to prune`,
          );
          const result = await runLayerSave(store, plan, (drawing, layerId) =>
            renderLayer(drawing, layerId, ink).then(
              async (blob) => new Uint8Array(await blob.arrayBuffer()),
            ),
          );
          if (result.failed > 0) {
            setLayerStatus("error");
            log.warn(`${result.failed} file(s) failed to write`);
            return;
          }
          setSavedVersion(at);
          setLayerStatus("saved");
        } catch (err) {
          setLayerStatus("error");
          log.error(
            `save failed — ${err instanceof Error ? err.message : String(err)}`,
          );
        } finally {
          inFlight.current = false;
        }
      })();
    },
    [allowed, files, doc],
  );

  return { canSaveLayers: allowed, layersDirty, layerStatus, saveLayers };
}
