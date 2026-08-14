// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import type { AppData } from "./types.ts";

// What a sidebar drag carries, where it can land, and which of those landings
// make sense. The framework's `useDragDrop` is generic over both ends of the
// gesture — it owns recognising the drag, following the pointer, and hit-testing
// the zones, and knows nothing about drawings or folders. This module is the
// app's half of that contract, kept pure and out of the component so the rules
// can be read (and tested) without a pointer in hand.
//
// `canDrop` is not only about refusing illegal drops: the framework asks it to
// decide which zones *light up* when a row is lifted, so every rule here is
// also a statement about what the user is shown. That is why the no-ops are
// refused rather than quietly allowed — a folder row that offers itself as a
// destination for a drawing already filed in it is a lie, however harmless the
// drop would be.

/** What a sidebar drag carries. */
export type DragItem = { kind: "drawing" | "folder"; id: string };

/** Where a sidebar drag can be released. */
export type DropTarget =
  | { kind: "folder"; id: string }
  | { kind: "root" }
  | { kind: "namespace"; slug: string }
  | { kind: "archive" };

/** Whether `drag` may land on `target`, given the document it is being dragged
 *  around in. */
export function canDrop(
  data: AppData,
  drag: DragItem,
  target: DropTarget,
): boolean {
  switch (target.kind) {
    case "folder":
      // Only drawings file into folders: a sketchbook's folders are flat by
      // design (see `types.ts`), so there is no nesting one inside another.
      // A drawing already in this folder has nowhere to go.
      return (
        drag.kind === "drawing" &&
        data.drawings.some((d) => d.id === drag.id && d.folderId !== target.id)
      );
    case "root":
      // The list itself lifts a filed drawing back to the top level —
      // meaningless for one already there, and for a folder (which has no
      // parent to leave).
      return (
        drag.kind === "drawing" &&
        data.drawings.some((d) => d.id === drag.id && d.folderId != null)
      );
    case "namespace":
      // Either kind can be handed to another sketchbook. The switcher never
      // offers the active namespace as a target, so "move it to where it
      // already is" can't be dropped in the first place.
      return true;
    case "archive":
      // Either kind can be shelved. Only live rows are in the menu to drag.
      return true;
  }
}
