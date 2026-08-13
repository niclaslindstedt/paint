// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useRef, useState } from "react";
import type { ReactNode } from "react";

import {
  ArchiveIcon,
  CogIcon,
  ConfirmDialog,
  CopyIcon,
  ExternalLinkIcon,
  FloatingPanel,
  FolderIcon,
  FolderOpenIcon,
  HeartIcon,
  HelpCircleIcon,
  PencilIcon,
  PlusIcon,
  RedoIcon,
  RowActionMenu,
  ShieldIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  UndoIcon,
  type FloatingPlacement,
} from "@niclaslindstedt/oss-framework/components";
import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";
import {
  CheckForUpdatesItem,
  type PwaUpdateCheckResult,
} from "@niclaslindstedt/oss-framework/pwa";
import { NamespaceSwitcher } from "@niclaslindstedt/oss-framework/namespaces";
import type {
  Namespace,
  NamespaceAppearance,
} from "@niclaslindstedt/oss-framework/namespaces";

import { useT } from "./i18n/index.ts";
import {
  BarButton,
  DrawingRow,
  FolderEditRow,
  FolderRow,
  FooterCollapseRail,
  FooterLink,
  FooterRow,
  SectionHeader,
} from "./SideMenuRows.tsx";
import {
  archivedCount,
  drawingsInFolder,
  favoriteDrawings,
  liveFolders,
  type Drawing,
} from "./types.ts";
import type { PaintStore } from "./usePaintStore.ts";

// The sidebar's contents — the rows the framework `Sidebar` shell frames. Top
// to bottom: the namespace switcher, the starred drawings, the drawing list
// grouped into folders, the button island, the collapse rail, and the footer.
//
// The framework owns the drawer itself (`Sidebar`), the namespace switcher, the
// row action menus, the floating panel behind "About", and the update row; this
// component owns what a drawing row looks like and which app action each button
// runs. The presentational leaves live in `SideMenuRows.tsx`.

// The About dropdown opens up-and-to-the-left of its footer trigger — there is
// no room below it at the foot of the drawer, and the framework's
// `FloatingPanel` flips it above automatically.
const ABOUT_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 200 },
  anchor: "left",
  coordinateSpace: "viewport",
};

// The project links the footer surfaces. The donate target is configurable at
// build time (`VITE_DONATE_URL`) so the sponsorship destination can change
// without a code edit; it falls back to the project's GitHub Sponsors page.
const SOURCE_URL = "https://github.com/niclaslindstedt/paint";
const DONATE_URL =
  (import.meta.env.VITE_DONATE_URL as string | undefined)?.trim() ||
  "https://github.com/sponsors/niclaslindstedt";
// The subtitle under the Source row — the build identifier composed at build
// time (see `vite.config.ts`): version, CI run number, deploy slot, and the
// short commit hash, e.g. `1.5.0.297-pre+dba6a70`.
const BUILD_LABEL = __BUILD_LABEL__;

type Props = {
  store: PaintStore;
  activeNamespace: Namespace;
  namespaces: Namespace[];
  onSwitchNamespace: (slug: string) => void;
  onOpenNamespaces: () => void;
  onOpenSettings: () => void;
  onOpenChangelog: () => void;
  onNavigate: () => void;
  /** The screen the main area is showing — lights the Archive island cell when
   *  the archive is the view in front of you. */
  view: "canvas" | "archive";
  onShowArchive: () => void;
  onShowCanvas: () => void;
  /** The framework's `SyncStatus` glyph, rendered as the island's last cell.
   *  Absent on the on-device backend, which has no remote to sync against — the
   *  bottom row then holds two cells instead of three. */
  syncSlot?: ReactNode;
  checkingUpdate: boolean;
  updateAvailable: boolean;
  onCheckUpdate: () => Promise<PwaUpdateCheckResult>;
};

export function SideMenuContent({
  store,
  activeNamespace,
  namespaces,
  onSwitchNamespace,
  onOpenNamespaces,
  onOpenSettings,
  onOpenChangelog,
  onNavigate,
  view,
  onShowArchive,
  onShowCanvas,
  syncSlot,
  checkingUpdate,
  updateAvailable,
  onCheckUpdate,
}: Props) {
  const t = useT();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const doomed = store.data.drawings.find((d) => d.id === pendingDelete);

  // Which folders are folded shut, and the inline name editors. All view-local
  // — the persisted folder registry lives in the store.
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);

  // Whether the footer is folded away behind the collapse rail. Unlike the
  // view-local state above this choice is remembered across reloads, and it is
  // offered on every viewport — the phone drawer gets the same control as the
  // docked sidebar.
  const [footerCollapsed, setFooterCollapsed] = useLocalStorageState(
    "paint:footer-collapsed",
    false,
  );

  // The footer's About dropdown, anchored to its row and flipped upward.
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutRef = useRef<HTMLButtonElement>(null);

  const folders = liveFolders(store.data);
  const ungrouped = drawingsInFolder(store.data, null);
  const favorites = favoriteDrawings(store.data);
  const archived = archivedCount(store.data);
  const privacyUrl = `${import.meta.env.BASE_URL}privacy`;

  function toggleFolder(id: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Expand a folder if it is folded shut — so a drawing dropped into it is
   *  actually visible when the menu jumps to it. */
  function ensureExpanded(id: string) {
    setCollapsedFolders((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function openDrawing(id: string) {
    store.setActive(id);
    onShowCanvas();
    onNavigate();
  }

  function createDrawing(folderId: string | null) {
    if (folderId !== null) ensureExpanded(folderId);
    store.addDrawing("", folderId);
    onShowCanvas();
    onNavigate();
  }

  // One drawing row, wrapped in the framework's right-click / long-press action
  // menu. The star toggle rides in the row itself (a favorite is toggled often
  // enough to deserve a tap target); filing, archiving, duplicating and
  // deleting live in the menu.
  function renderDrawing(drawing: Drawing, indented: boolean): ReactNode {
    // Filing is offered only when there is somewhere to file to — a folder to
    // move into, or (for a filed drawing) the top level to lift back to.
    const moveActions = [
      ...folders
        .filter((f) => f.id !== drawing.folderId)
        .map((folder) => ({
          label: t("menu.moveToFolder", { name: folder.name }),
          icon: <FolderOpenIcon className="h-4 w-4" />,
          onSelect: () => store.moveDrawingToFolder(drawing.id, folder.id),
        })),
      ...(drawing.folderId
        ? [
            {
              label: t("menu.moveToTopLevel"),
              icon: <FolderIcon className="h-4 w-4" />,
              onSelect: () => store.moveDrawingToFolder(drawing.id, null),
            },
          ]
        : []),
    ];
    return (
      <li key={drawing.id}>
        <RowActionMenu
          ariaLabel={drawing.name.trim() || t("menu.untitled")}
          actions={[
            {
              label: drawing.favorite
                ? t("menu.unfavorite")
                : t("menu.favorite"),
              icon: <StarIcon className="h-4 w-4" filled={drawing.favorite} />,
              onSelect: () => store.toggleFavorite(drawing.id),
            },
            ...moveActions,
            {
              label: t("common.duplicate"),
              icon: <CopyIcon className="h-4 w-4" />,
              onSelect: () => {
                store.duplicateDrawing(drawing.id);
                onShowCanvas();
                onNavigate();
              },
            },
            {
              label: t("menu.archive"),
              icon: <ArchiveIcon className="h-4 w-4" />,
              onSelect: () => store.setDrawingArchived(drawing.id, true),
            },
            {
              label: t("common.delete"),
              icon: <TrashIcon className="h-4 w-4" />,
              danger: true,
              onSelect: () => setPendingDelete(drawing.id),
            },
          ]}
        >
          <DrawingRow
            name={drawing.name.trim() || t("menu.untitled")}
            active={view === "canvas" && drawing.id === store.activeDrawing?.id}
            indented={indented}
            onClick={() => openDrawing(drawing.id)}
            trailing={
              drawing.favorite ? (
                <StarIcon
                  className="h-3.5 w-3.5 shrink-0 text-accent"
                  filled
                  aria-label={t("menu.favorite")}
                />
              ) : undefined
            }
          />
        </RowActionMenu>
      </li>
    );
  }

  return (
    // The framework panel reserves a bottom safe-area inset as padding so its
    // last child clears the home indicator — but this PWA paints edge to edge
    // (see `styles.css`), so that inset is dead space below whatever sits last
    // (the rail when the footer is folded, the footer when it isn't). Grow past
    // the panel's content box to reclaim it for the scrolling list; the footer
    // and the rail then carry their own bottom breathing room.
    <div className="flex h-[calc(100%+env(safe-area-inset-bottom))] min-h-0 flex-col">
      <NamespaceSwitcher
        namespaces={namespaces}
        activeNamespace={activeNamespace.slug}
        onSwitch={(slug: string) => onSwitchNamespace(slug)}
        onManage={onOpenNamespaces}
        labels={{
          manage: t("namespaces.heading"),
          switchTo: (name: string) => t("namespaces.switchTo", { name }),
        }}
      />

      {/* Favorites: the drawings starred from the canvas header's star button,
          lifted above the ordinary list so they're one tap away wherever they
          are filed. The section only exists once something is starred — an
          empty heading would be noise in a drawer this dense, and the star
          button is where the feature is discovered. */}
      {favorites.length > 0 && (
        <div className="shrink-0">
          <SectionHeader label={t("menu.favorites")} border />
          <ul className="flex flex-col">
            {favorites.map((drawing) => renderDrawing(drawing, false))}
          </ul>
        </div>
      )}

      <SectionHeader label={t("menu.drawings")} border={favorites.length > 0} />

      <nav
        aria-label={t("menu.drawings")}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2"
      >
        {creatingFolder && (
          <FolderEditRow
            placeholder={t("menu.folderName")}
            onCommit={(name) => {
              store.addFolder(name);
              setCreatingFolder(false);
            }}
            onCancel={() => setCreatingFolder(false)}
          />
        )}

        {folders.map((folder) => {
          if (renamingFolder === folder.id) {
            return (
              <FolderEditRow
                key={folder.id}
                initial={folder.name}
                placeholder={t("menu.folderName")}
                onCommit={(name) => {
                  store.renameFolder(folder.id, name);
                  setRenamingFolder(null);
                }}
                onCancel={() => setRenamingFolder(null)}
              />
            );
          }
          const inside = drawingsInFolder(store.data, folder.id);
          const expanded = !collapsedFolders.has(folder.id);
          return (
            <div key={folder.id}>
              <RowActionMenu
                ariaLabel={folder.name}
                actions={[
                  {
                    label: t("menu.newDrawingIn", { name: folder.name }),
                    icon: <PlusIcon className="h-4 w-4" />,
                    onSelect: () => createDrawing(folder.id),
                  },
                  {
                    label: t("common.rename"),
                    icon: <PencilIcon className="h-4 w-4" />,
                    onSelect: () => setRenamingFolder(folder.id),
                  },
                  {
                    label: t("menu.archive"),
                    icon: <ArchiveIcon className="h-4 w-4" />,
                    onSelect: () => store.setFolderArchived(folder.id, true),
                  },
                  {
                    label: t("menu.deleteFolder"),
                    icon: <TrashIcon className="h-4 w-4" />,
                    danger: true,
                    onSelect: () => store.deleteFolder(folder.id),
                  },
                ]}
              >
                <FolderRow
                  name={folder.name}
                  count={inside.length}
                  expanded={expanded}
                  addLabel={t("menu.newDrawingIn", { name: folder.name })}
                  onToggle={() => toggleFolder(folder.id)}
                  onAdd={() => createDrawing(folder.id)}
                />
              </RowActionMenu>
              {expanded && (
                <ul className="flex flex-col">
                  {inside.map((drawing) => renderDrawing(drawing, true))}
                </ul>
              )}
            </div>
          );
        })}

        <ul className="flex flex-col">
          {ungrouped.map((drawing) => renderDrawing(drawing, false))}
        </ul>
      </nav>

      {/* The button island: New drawing / New folder / Archive over Undo /
          Redo / the cloud glyph, sharing one bordered block pinned above the
          footer so it falls under the thumb no matter how long the list is.
          Each cell splits its row's width evenly; the block owns the border,
          the rounding, and the dividers. */}
      <div className="shrink-0 px-3 pt-2 pb-3">
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
          <div className="flex divide-x divide-line">
            <BarButton
              label={t("menu.newDrawing")}
              onClick={() => createDrawing(null)}
            >
              <PlusIcon className="h-5 w-5" />
            </BarButton>
            <BarButton
              label={t("menu.newFolder")}
              onClick={() => setCreatingFolder(true)}
            >
              <FolderIcon className="h-5 w-5" />
            </BarButton>
            <BarButton
              label={t("menu.archive")}
              badge={archived > 0 ? String(archived) : undefined}
              current={view === "archive"}
              onClick={() => {
                onShowArchive();
                onNavigate();
              }}
            >
              <ArchiveIcon className="h-5 w-5" />
            </BarButton>
          </div>
          <div className="flex divide-x divide-line">
            <BarButton
              label={t("menu.undo")}
              disabled={!store.canUndo}
              onClick={store.undo}
            >
              <UndoIcon className="h-5 w-5" />
            </BarButton>
            <BarButton
              label={t("menu.redo")}
              disabled={!store.canRedo}
              onClick={store.redo}
            >
              <RedoIcon className="h-5 w-5" />
            </BarButton>
            {syncSlot && (
              <div className="flex flex-1 items-center justify-center py-[calc(var(--density-row-py)+0.25rem)]">
                {syncSlot}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The collapse rail — folds the footer away (and back), handing the
          freed height to the drawing list. Offered on every viewport. */}
      <FooterCollapseRail
        collapsed={footerCollapsed}
        label={
          footerCollapsed ? t("menu.expandFooter") : t("menu.collapseFooter")
        }
        onClick={() => setFooterCollapsed((v) => !v)}
      />

      {/* The footer: Donate, an About dropdown that folds away the project
          links, the framework's "check for updates" row, and Settings pinned
          last under the thumb. The app paints under the home indicator, so the
          bottom breathing room carries the safe-area inset plus 10px to keep
          that last row a comfortable reach rather than sitting on the edge. */}
      {!footerCollapsed && (
        <div className="flex shrink-0 flex-col border-t border-line pt-1 [padding-bottom:calc(env(safe-area-inset-bottom)+10px)]">
          <FooterLink
            icon={<HeartIcon className="h-5 w-5 text-danger" />}
            href={DONATE_URL}
            external
          >
            {t("menu.donate")}
          </FooterLink>
          <FooterRow
            buttonRef={aboutRef}
            expanded={aboutOpen}
            icon={<HelpCircleIcon className="h-5 w-5" />}
            onClick={() => setAboutOpen((v) => !v)}
          >
            {t("menu.about")}
          </FooterRow>
          <CheckForUpdatesItem
            checking={checkingUpdate}
            updateAvailable={updateAvailable}
            onCheck={onCheckUpdate}
            labels={{
              idle: t("menu.checkUpdate"),
              checking: t("menu.checking"),
              updateAvailable: t("menu.updateAvailable"),
              upToDate: t("menu.upToDate"),
            }}
          />
          <FooterRow
            icon={<CogIcon className="h-5 w-5" />}
            onClick={onOpenSettings}
          >
            {t("menu.settings")}
          </FooterRow>
        </div>
      )}

      {/* The About dropdown — portalled and positioned by the framework's
          `FloatingPanel`. "What's new" opens the changelog dialog; Source is an
          external link wearing the build label as its subtitle; Privacy is the
          standalone policy page the build emits at `/privacy/`. */}
      <FloatingPanel
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        triggerRef={aboutRef}
        placement={ABOUT_PLACEMENT}
        className="py-1"
      >
        <FooterRow
          icon={<SparklesIcon className="h-5 w-5" />}
          onClick={() => {
            setAboutOpen(false);
            onOpenChangelog();
          }}
        >
          {t("menu.whatsNew")}
        </FooterRow>
        <FooterLink
          icon={<ExternalLinkIcon className="h-5 w-5" />}
          href={SOURCE_URL}
          sublabel={BUILD_LABEL}
          external
          onClick={() => setAboutOpen(false)}
        >
          {t("menu.sourceCode")}
        </FooterLink>
        <FooterLink
          icon={<ShieldIcon className="h-5 w-5" />}
          href={privacyUrl}
          onClick={() => setAboutOpen(false)}
        >
          {t("menu.privacy")}
        </FooterLink>
      </FloatingPanel>

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

/** Re-exported for the settings tab's namespace hint — the appearance patch
 *  shape the framework modal hands back. */
export type { NamespaceAppearance };
