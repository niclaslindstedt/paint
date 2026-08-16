// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  createMigrator,
  type Versioned,
} from "@niclaslindstedt/oss-framework/storage";

import { logStore } from "./log.ts";
import {
  DEFAULT_CANVAS,
  type AppData,
  type Drawing,
  type Folder,
} from "./types.ts";

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
export const LATEST_VERSION = 3;

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
  // v1 → v2: folders, favorites, and the archive. The document grew a `folders`
  // array the side menu groups by; a drawing grew `folderId` (which folder it
  // is filed in) and `favorite` (starred). All three are optional on a drawing,
  // so an existing document needs nothing rewritten — every drawing simply
  // reads as ungrouped, unstarred, and live. The step exists to guarantee the
  // `folders` array itself, which the menu iterates unconditionally.
  1: (doc: Versioned): Versioned => ({
    ...doc,
    version: 2,
    folders: Array.isArray(doc.folders) ? doc.folders : [],
  }),
  // v2 → v3: filters became effects. A drawing (and any layer of it) could carry
  // a `filters` array — a blur or a grain the picture was composited through on
  // every frame, forever. Nothing reads that field any more: the same two
  // operations are now applied *to* the marks, once, and the drawing holds the
  // result (see `effects.ts`). So the field is dropped rather than left to rot
  // as a key nothing writes and nothing honours.
  //
  // The softening itself cannot be carried forward, and this is the one step in
  // the chain that loses something a user could see: baking it would need a
  // canvas, and a migration runs on bytes with no DOM in reach. A drawing that
  // was blurred therefore opens sharp — with every mark intact, because the
  // marks were never what the filter changed — and the effect is one press away
  // in the panel. That is a better trade than an upgrade that quietly flattens
  // a document's strokes into a bitmap nobody asked it to.
  2: (doc: Versioned): Versioned => ({
    ...doc,
    version: 3,
    drawings: (Array.isArray(doc.drawings) ? doc.drawings : []).map((raw) => {
      const d = { ...(raw as Record<string, unknown>) };
      delete d.filters;
      if (Array.isArray(d.layers)) {
        d.layers = d.layers.map((layer) => {
          const next = { ...(layer as Record<string, unknown>) };
          delete next.filters;
          return next;
        });
      }
      return d;
    }),
  }),
  // Not every model change needs a step. Dropped images added a new *shape kind*
  // (`image`, holding its bitmap as a data URL) and a new plugin id to paint it
  // — and nothing already on disk has to be rewritten for that: an older
  // document simply holds no image strokes, and a document holding one still
  // parses in a build that predates them (it keeps the stroke and paints it
  // through the generic painter rather than dropping it). Bumping the version
  // for a purely additive shape would have made every new document unreadable
  // to the build a stale service worker is still serving, for no gain. A step
  // belongs here when old bytes need *changing*, not whenever the model grows.
  //
  // The same goes for the ground a drawing is on (`Drawing.ground`): a document
  // carrying none reads as the plain solid sheet, which is the page every
  // drawing was already on, so there are no old bytes to change — see
  // `tests/migrations_test.ts`.
  //
  // …and for the canvas preset one was made on (`Drawing.canvasPreset`): a document
  // carrying none reads as a page made at a size off the shelf, which is what
  // every drawing until now is, and the id it would hold names something in the
  // *settings* blob rather than anything in the document.
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
    folders: (Array.isArray(doc.folders) ? doc.folders : []) as Folder[],
    drawings: (Array.isArray(doc.drawings) ? doc.drawings : []) as Drawing[],
    activeDrawingId:
      typeof doc.activeDrawingId === "string" ? doc.activeDrawingId : "",
  };
}

/** Serialize a document for the bytes at rest (IndexedDB and the cloud
 *  backends): stamp the latest version onto the version-free model. */
export function serializeDoc(data: AppData): string {
  return JSON.stringify({ version: LATEST_VERSION, ...data });
}

/** Parse bytes from any backend into the app model, upgrading old shapes. */
export function parseDoc(text: string): AppData {
  return toAppData(migrator.migrate(JSON.parse(text)).data);
}
