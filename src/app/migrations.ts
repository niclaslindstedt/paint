// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  createMigrator,
  type Versioned,
} from "@niclaslindstedt/oss-framework/storage";

import { logStore } from "./log.ts";
import { DEFAULT_CANVAS, type AppData, type Drawing } from "./types.ts";

// The persisted-document migration chain, built on the framework's
// `createMigrator`. The framework owns the engine (run a parsed document
// forward, throw on a newer-than-build or gappy chain); the *steps* below are
// this app's own data model.
//
// The version lives only on the bytes at rest: `AppData` (the in-memory model)
// stays version-free; `usePaintStore` stamps `LATEST_VERSION` when it writes
// and runs `migrator.migrate` when it reads — and the same bytes travel to the
// cloud backends, so a document written by an older build upgrades wherever it
// comes back from.

/** The current persisted-document version. Bump it and add a step below when
 *  the on-disk shape changes — every shipped step stays forever. */
export const LATEST_VERSION = 1;

const migrations = {
  // v0 (pre-versioning / blank) → v1: the bootstrap step. Guarantee the
  // drawings array and the active pointer exist, and give every drawing the
  // page fields the canvas reads unconditionally.
  0: (doc: Versioned): Versioned => {
    const drawings = (Array.isArray(doc.drawings) ? doc.drawings : []).map(
      (raw) => {
        const d = raw as Record<string, unknown>;
        return {
          ...d,
          name: typeof d.name === "string" ? d.name : "",
          width: typeof d.width === "number" ? d.width : DEFAULT_CANVAS.width,
          height:
            typeof d.height === "number" ? d.height : DEFAULT_CANVAS.height,
          // No default: an absent background means "follow the canvas theme".
          ...(typeof d.background === "string"
            ? { background: d.background }
            : {}),
          strokes: Array.isArray(d.strokes) ? d.strokes : [],
        };
      },
    );
    return {
      ...doc,
      version: 1,
      drawings,
      activeDrawingId:
        typeof doc.activeDrawingId === "string"
          ? doc.activeDrawingId
          : ((drawings[0] as Drawing | undefined)?.id ?? ""),
    };
  },
} as const;

export const migrator = createMigrator({
  latestVersion: LATEST_VERSION,
  migrations,
  // Route the one "migrated vX → vY" line into the same in-app buffer the Logs
  // tab renders — so an upgrade is visible, not silent.
  logger: logStore.createLogger("migrate"),
});

/** Narrow a migrated document back to the app's version-free model. The chain
 *  guarantees the fields exist; this just re-asserts the static shape. */
export function toAppData(doc: Versioned): AppData {
  return {
    drawings: (Array.isArray(doc.drawings) ? doc.drawings : []) as Drawing[],
    activeDrawingId:
      typeof doc.activeDrawingId === "string" ? doc.activeDrawingId : "",
  };
}

/** Serialize a document for the bytes at rest (localStorage and the cloud
 *  backends): stamp the latest version onto the version-free model. */
export function serializeDoc(data: AppData): string {
  return JSON.stringify({ version: LATEST_VERSION, ...data });
}

/** Parse bytes from any backend into the app model, upgrading old shapes. */
export function parseDoc(text: string): AppData {
  return toAppData(migrator.migrate(JSON.parse(text)).data);
}
