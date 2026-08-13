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
 *  aside, so re-connecting a device that already matches never nags. */
function sameContent(a: AppData, b: AppData): boolean {
  return JSON.stringify(a.drawings) === JSON.stringify(b.drawings);
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
