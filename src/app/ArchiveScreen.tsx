// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useState } from "react";
import type { ReactNode } from "react";

import {
  ArchiveIcon,
  ConfirmDialog,
  FolderIcon,
  RestoreIcon,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";

import { CanvasIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import type { PaintStore } from "./usePaintStore.ts";

// The Archive screen — the second top-level view, reached from the side menu's
// Archive button. Read-mostly: nothing is created here, things only arrive by
// being archived from the menu. It holds the two things the document can
// shelve:
//
//   • Archived **folders**, restored or deleted as a whole — restoring brings
//     the folder and every drawing it carried back into the menu.
//   • Archived **drawings** shelved on their own, restored or deleted one by
//     one.
//
// A drawing that came in with its folder is listed under that folder rather
// than on its own, so restoring the group is one action instead of many.

export function ArchiveScreen({
  store,
  onShowCanvas,
}: {
  store: PaintStore;
  /** Leave the archive for the canvas — where a restored drawing is opened. */
  onShowCanvas: () => void;
}) {
  const t = useT();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const doomed = store.data.drawings.find((d) => d.id === pendingDelete);

  const archivedFolders = store.data.folders.filter((f) => f.archived);
  const archivedFolderIds = new Set(archivedFolders.map((f) => f.id));
  // Drawings shelved on their own — archived, but not swept up by an archived
  // folder (those are restored and deleted at the folder level instead).
  const loose = store.data.drawings.filter(
    (d) => d.archived && !archivedFolderIds.has(d.folderId ?? ""),
  );
  const total =
    archivedFolders.length +
    store.data.drawings.filter((d) => d.archived).length;

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-4 pt-[calc(0.75rem+env(safe-area-inset-top))]">
      <header className="mb-2 flex items-center gap-3 border-b border-line px-1 pb-3">
        <ArchiveIcon className="h-5 w-5 shrink-0 text-muted" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold tracking-wide text-fg-bright">
          {t("archive.title")}
        </h1>
        <span className="shrink-0 text-sm text-muted tabular-nums">
          {total}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto [overscroll-behavior:contain] pb-[calc(env(safe-area-inset-bottom)+10px)]">
        {total === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-muted">
            {t("archive.empty")}
          </p>
        ) : (
          <>
            {archivedFolders.length > 0 && (
              <section className="mb-2">
                <SectionLabel>{t("archive.folders")}</SectionLabel>
                <ul className="m-0 flex list-none flex-col p-0">
                  {archivedFolders.map((folder) => {
                    const members = store.data.drawings.filter(
                      (d) => d.folderId === folder.id && d.archived,
                    );
                    return (
                      <li key={folder.id}>
                        <ArchiveRow
                          title={folder.name}
                          icon={<FolderIcon className="h-4 w-4" />}
                          meta={t("archive.drawingsCount", {
                            n: String(members.length),
                          })}
                          restoreLabel={t("archive.restoreFolder")}
                          onRestore={() =>
                            store.setFolderArchived(folder.id, false)
                          }
                          deleteLabel={t("menu.deleteFolder")}
                          onDelete={() => store.deleteFolder(folder.id)}
                        />
                        {members.length > 0 && (
                          <ul className="m-0 flex list-none flex-col p-0 pl-6">
                            {members.map((drawing) => (
                              <li key={drawing.id}>
                                <ArchiveRow
                                  title={
                                    drawing.name.trim() || t("menu.untitled")
                                  }
                                  icon={<CanvasIcon className="h-4 w-4" />}
                                  meta={t("archive.marks", {
                                    n: String(drawing.strokes.length),
                                  })}
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {loose.length > 0 && (
              <section>
                <SectionLabel>{t("archive.drawings")}</SectionLabel>
                <ul className="m-0 flex list-none flex-col p-0">
                  {loose.map((drawing) => (
                    <li key={drawing.id}>
                      <ArchiveRow
                        title={drawing.name.trim() || t("menu.untitled")}
                        icon={<CanvasIcon className="h-4 w-4" />}
                        meta={t("archive.marks", {
                          n: String(drawing.strokes.length),
                        })}
                        restoreLabel={t("archive.restore")}
                        onRestore={() => {
                          store.setDrawingArchived(drawing.id, false);
                          onShowCanvas();
                        }}
                        deleteLabel={t("common.delete")}
                        onDelete={() => setPendingDelete(drawing.id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={t("common.delete")}
        description={t("menu.deleteConfirm", {
          name: doomed?.name.trim() || t("menu.untitled"),
        })}
        confirmLabel={t("common.delete")}
        tone="danger"
        onConfirm={() => {
          if (pendingDelete) store.deleteDrawing(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-1 pt-3 pb-1 text-xs font-bold tracking-wide text-muted uppercase">
      {children}
    </h2>
  );
}

/** One shelved thing: its name and size on the left, and — when it is the row
 *  that owns the decision — restore / delete on the right. A drawing listed
 *  under its archived folder carries no buttons of its own: it came in with the
 *  folder and goes back out with it. */
function ArchiveRow({
  title,
  icon,
  meta,
  restoreLabel,
  onRestore,
  deleteLabel,
  onDelete,
}: {
  title: string;
  icon: ReactNode;
  meta: string;
  restoreLabel?: string;
  onRestore?: () => void;
  deleteLabel?: string;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded px-1 py-2 hover:bg-surface-2">
      <span className="shrink-0 text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{title}</span>
      <span className="shrink-0 text-xs text-muted tabular-nums">{meta}</span>
      {onRestore && restoreLabel && (
        <RowButton label={restoreLabel} onClick={onRestore}>
          <RestoreIcon className="h-4 w-4" />
        </RowButton>
      )}
      {onDelete && deleteLabel && (
        <RowButton label={deleteLabel} onClick={onDelete} danger>
          <TrashIcon className="h-4 w-4" />
        </RowButton>
      )}
    </div>
  );
}

function RowButton({
  children,
  label,
  onClick,
  danger,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-surface-3 ${
        danger ? "text-muted hover:text-danger" : "text-muted hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
