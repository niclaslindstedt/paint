// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  ContextMenu,
  FolderIcon,
  FolderOpenIcon,
  type FloatingPoint,
  type RowAction,
} from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import type { Folder } from "./types.ts";

// The "Move to folder" submenu — the sidebar's folders as a flat picker, led by
// a "No folder" entry that lifts the drawing back to the top level. Picking one
// files the drawing there.
//
// It exists so the row's action menu stays short: filing used to be one entry
// per folder inline, which is fine with two folders and a wall of near-identical
// rows with ten. It is also the pointer's counterpart to the drag gesture — the
// same move, reachable without holding a button down — so it opens *at the
// pointer*, where the row was right-clicked, and reads as a genuine submenu of
// the menu that spawned it rather than a dialog that arrived from nowhere.
//
// A thin wrapper over the framework's `ContextMenu`; the sibling `contacts` app
// has the same component over a folder *tree*, where the entries are indented by
// depth. A paint sketchbook's folders are flat by design (see `types.ts`), so
// here the list is flat too.
export function MoveToFolderMenu({
  folders,
  position,
  onMove,
  onClose,
}: {
  /** The folders that can be picked — already filtered to the live set. */
  folders: readonly Folder[];
  /** The pointer point to open at, or `null` while the menu is closed. */
  position: FloatingPoint | null;
  /** The chosen destination — a folder id, or `null` for the top level. */
  onMove: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const t = useT();
  const actions: RowAction[] = [
    {
      label: t("menu.noFolder"),
      icon: <FolderOpenIcon className="h-4 w-4" />,
      onSelect: () => onMove(null),
    },
    ...folders.map((folder) => ({
      label: folder.name,
      icon: <FolderIcon className="h-4 w-4" />,
      onSelect: () => onMove(folder.id),
    })),
  ];
  return (
    <ContextMenu
      position={position}
      actions={actions}
      onClose={onClose}
      ariaLabel={t("menu.moveToFolderMenu")}
    />
  );
}
