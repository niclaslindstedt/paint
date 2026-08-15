// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { parseDoc } from "./migrations.ts";
import type { AppData } from "./types.ts";

// The connect-time reconcile decision: when a backend is first connected and it
// already holds drawings, the local document and the remote copy can't both
// silently win — one would clobber the other. These pure helpers decide whether
// that collision warrants a prompt and summarise each side so `CloudSetupModal`
// can show what's at stake ("this device: 3 drawings, 412 marks" vs "Dropbox: 1
// drawing, 12 marks"). Kept out of `useSyncEngine` so the decision is
// unit-testable without a DOM or a live adapter.

/** A count-only précis of a document, shown beside each choice in the prompt. */
export type CloudDocSummary = { drawings: number; strokes: number };

/** Count the drawings and total marks a document holds. */
export function summarizeDoc(data: AppData): CloudDocSummary {
  return {
    drawings: data.drawings.length,
    strokes: data.drawings.reduce((n, d) => n + d.strokes.length, 0),
  };
}

/** Whether two documents carry the same drawings — the active-page pointer
 *  aside, so re-connecting a device that already matches never nags.
 *
 *  `srcPath` is skipped on both sides: it records where a dropped picture's
 *  bytes are filed on the backend (see `imageStore.ts`), not what is on the
 *  page. A copy that came back from a backend carries one and a copy that has
 *  never been pushed doesn't — comparing it would make every device look like a
 *  collision the first time it connected. */
function sameContent(a: AppData, b: AppData): boolean {
  return contentKey(a) === contentKey(b);
}

function contentKey(data: AppData): string {
  return JSON.stringify(data.drawings, (key, value: unknown) =>
    key === "srcPath" ? undefined : value,
  );
}

/** Whether a document holds anything worth protecting. A fresh app boots with
 *  one empty page, and that is *not* content — a first connect from a
 *  never-used device shouldn't raise a prompt over it. */
export function isEmptyDoc(data: AppData): boolean {
  return data.drawings.every((d) => d.strokes.length === 0 && !d.name.trim());
}

/** The state the auto-save gate reads. Kept a plain record (rather than the
 *  live engine) so the decision is unit-testable — see {@link shouldAutoSave}. */
export type AutoSaveGate = {
  /** A remote backend (folder or cloud) is selected — a local-only document
   *  never pushes. */
  isRemote: boolean;
  /** The active remote backend has credentials / a granted handle. */
  connected: boolean;
  /** The working copy holds an edit the backend hasn't got yet. */
  dirty: boolean;
  /** A blocking fault (offline, auth, conflict) stands in the way. */
  blocked: boolean;
  /** The cloud copy is an encrypted envelope and no passphrase is in memory. */
  locked: boolean;
  /** A connect-time replace-or-adopt prompt is open, holding writes. */
  pendingSetup: boolean;
  /** The mount baseline read has learned the backend's current revision. Until
   *  it has, a push would carry an unknown base revision, which the adapter
   *  rejects as a conflict once a document exists — surfacing a phantom
   *  conflict for a mark made moments after opening. The mark stays safe in the
   *  local working copy meanwhile, and the push follows once the baseline
   *  resolves. */
  baselineReady: boolean;
};

/** Whether a settled edit should be pushed to the active remote backend now. */
export function shouldAutoSave(gate: AutoSaveGate): boolean {
  return (
    gate.isRemote &&
    gate.connected &&
    gate.dirty &&
    gate.baselineReady &&
    !gate.blocked &&
    !gate.locked &&
    !gate.pendingSetup
  );
}

/** The state the *layer* save gate reads — the disk button in the canvas
 *  header, which files a drawing's rendered layers out as a `.pct` tree beside
 *  the document (see `layerStore.ts`).
 *
 *  Deliberately not the same decision as {@link shouldAutoSave}. The vector
 *  document is kilobytes and pushes itself; the layers are megabytes and go up
 *  only when asked. So `dirty` is absent — a save is allowed on an unchanged
 *  document, because the backend may hold no layers for it yet — and two
 *  conditions appear that the document push has no equivalent of. */
export type LayerSaveGate = Omit<AutoSaveGate, "dirty"> & {
  /** A layer save is already in flight. */
  saving: boolean;
  /** The cloud copy is an encrypted envelope.
   *
   *  This *forbids* a layer save rather than merely delaying it. Filing a
   *  drawing's layers out as plaintext PNGs beside an AES-GCM envelope would
   *  hand over the very picture the envelope exists to hide — a padlock on the
   *  door and the photographs in the front garden. Dropped bitmaps are held
   *  back on the same grounds (see `imageStore.ts`), and the two must agree. */
  encrypted: boolean;
};

/** Whether the disk button may file the layers out right now. */
export function canSaveLayers(gate: LayerSaveGate): boolean {
  return (
    gate.isRemote &&
    gate.connected &&
    gate.baselineReady &&
    !gate.saving &&
    !gate.encrypted &&
    !gate.blocked &&
    !gate.locked &&
    !gate.pendingSetup
  );
}

/** The parsed remote document when a freshly-connected backend holds drawings
 *  that differ from this device's copy — the signal to raise the
 *  replace-or-adopt prompt. `null` means proceed silently: the remote is empty,
 *  already matches this device, this device has nothing to lose, or the bytes
 *  don't parse (nothing to adopt). */
export function evaluateCloudSetup(
  remoteText: string,
  local: AppData,
): AppData | null {
  let remote: AppData;
  try {
    remote = parseDoc(remoteText);
  } catch {
    return null; // Unparseable remote bytes — this device's copy stands.
  }
  if (isEmptyDoc(remote)) return null;
  if (sameContent(remote, local)) return null;
  // This device has nothing but a blank page: adopting the remote copy is
  // obviously right, so don't make the user confirm it. The caller adopts.
  if (isEmptyDoc(local)) return remote;
  return remote;
}

/** Whether the collision needs the user's decision, or can be resolved
 *  silently by adopting the remote copy (this device holds nothing). */
export function needsSetupPrompt(local: AppData): boolean {
  return !isEmptyDoc(local);
}
