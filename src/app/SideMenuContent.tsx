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
  ImageUpIcon,
  PencilIcon,
  PlusIcon,
  RowActionMenu,
  ShieldIcon,
  SparklesIcon,
  StarIcon,
  SwipeableRow,
  TrashIcon,
  type FloatingPlacement,
  type FloatingPoint,
  type RowAction,
} from "@niclaslindstedt/oss-framework/components";
import {
  dragHasFilesOfType,
  firstFileOfType,
  useFileDrop,
  useLocalStorageState,
} from "@niclaslindstedt/oss-framework/hooks";
import { NamespaceSwitcher } from "@niclaslindstedt/oss-framework/namespaces";
import type {
  Namespace,
  NamespaceAppearance,
} from "@niclaslindstedt/oss-framework/namespaces";
import { useDragDrop } from "@niclaslindstedt/oss-framework/sidebar";

import { CanvasIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { imageFileStem, importImageFile } from "./images.ts";
import { imageStroke } from "./plugins/builtin/image.ts";
import { MoveToFolderMenu } from "./MoveToFolderMenu.tsx";
import {
  BarButton,
  DragPreview,
  DraggableRow,
  DrawingRow,
  DropCue,
  FolderEditRow,
  FolderRow,
  FooterCollapseRail,
  FooterLink,
  FooterRow,
  SectionHeader,
} from "./SideMenuRows.tsx";
import { canDrop, type DragItem, type DropTarget } from "./sidebarDnd.ts";
import {
  archivedCount,
  drawingsInFolder,
  favoriteDrawings,
  liveFolders,
  type Drawing,
} from "./types.ts";
import { freshId, type PaintStore } from "./usePaintStore.ts";
import * as output from "../output.ts";

// The sidebar's contents — the rows the framework `Sidebar` shell frames. Top
// to bottom: the namespace switcher, the starred drawings, the drawing list
// grouped into folders, the button island, the collapse rail, and the footer.
//
// The framework owns the drawer itself (`Sidebar`), the namespace switcher, the
// row action menus, the swipe strips, the drag gesture, the floating panel
// behind "About", and the update row; this component owns what a drawing row
// looks like, which app action each button runs, and which drops are legal.
// The presentational leaves live in `SideMenuRows.tsx`.
//
// ## Reaching a row's actions
//
// Every row offers the same set of moves — file it, shelve it, bin it — through
// whichever gesture the pointer in your hand actually has:
//
//   • **Touch.** Swipe a row **right** to archive it, **left** to bare a Delete
//     button. Press and *hold* to pick the row up and drag it onto a folder, the
//     top level, another sketchbook, or Archive. There is deliberately no
//     long-press menu (`touchLongPress={false}`): a hold is how you lift a row,
//     and a gesture can only mean one thing.
//   • **Mouse / pen.** Right-click for the full action menu, or press and drag a
//     row to the same places the finger drags it. Swipe is off there — the
//     framework's `SwipeableRow` gates itself on the pointer — because a mouse
//     drag latching a row open is nobody's intention.
//
// Both halves reach the same store actions, so neither is a second-class way in.
//
// ## Where a dragged row can land
//
// Four kinds of target, each of which draws its own "let go here" cue: a folder
// row (an accent ring around the row), the scrolling list itself (a dashed frame
// — "move it out of the folder"), a namespace row in the switcher (the framework
// draws that one), and the island's Archive cell. Every legal target outlines
// itself the moment a row is lifted, so the landing spots are visible before the
// pointer goes looking for them. Which of them is legal for a given row is
// `sidebarDnd.ts`; what each drop *does* is `onDrop` below.

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
  /** Start a new drawing in `folderId` (`null` for the top level). The dialog
   *  that asks what it is made of lives in `App` rather than in here: on a
   *  phone this whole panel is unmounted the moment the drawer closes, and
   *  pressing New closes it — a dialog owned by the drawer would go with it. */
  onNewDrawing: (folderId: string | null) => void;
  onNavigate: () => void;
  /** The screen the main area is showing — lights the Archive island cell when
   *  the archive is the view in front of you. */
  view: "canvas" | "archive";
  onShowArchive: () => void;
  onShowCanvas: () => void;
  /** The framework's `SyncStatus` glyph, rendered as the island's last cell.
   *  Absent on the on-device backend, which has no remote to sync against — the
   *  island then holds three cells instead of four. */
  syncSlot?: ReactNode;
};

export function SideMenuContent({
  store,
  activeNamespace,
  namespaces,
  onSwitchNamespace,
  onOpenNamespaces,
  onOpenSettings,
  onOpenChangelog,
  onNewDrawing,
  onNavigate,
  view,
  onShowArchive,
  onShowCanvas,
  syncSlot,
}: Props) {
  const t = useT();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const doomed = store.data.drawings.find((d) => d.id === pendingDelete);

  // The "Move to folder" submenu. `movePointer` records where a row was
  // right-clicked — captured on the way down, before the row's action menu
  // opens — so the folder picker springs from the same spot; `movePicker` holds
  // which drawing is being filed once that action is chosen.
  const movePointer = useRef<FloatingPoint>({ x: 0, y: 0 });
  const [movePicker, setMovePicker] = useState<string | null>(null);

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

  // An image dropped on the *menu* starts a drawing from it, rather than
  // landing on whichever page happened to be open: the drawer is the list of
  // drawings, so dropping a picture into it means "make this one of them". The
  // page is cut to the picture's size and the file name (minus its extension)
  // becomes the drawing's name — a photo you drop is already called something.
  const panelRef = useRef<HTMLDivElement>(null);
  const { active: droppingImage } = useFileDrop({
    targetRef: panelRef,
    accepts: (dt) => dragHasFilesOfType(dt, "image/"),
    claim: true,
    onDrop: (files) => {
      const file = firstFileOfType(files, "image/");
      if (!file) return;
      void importImageFile(file)
        .then((image) => {
          const box = { x: 0, y: 0, width: image.width, height: image.height };
          store.addDrawing(imageFileStem(file.name), null, {
            width: image.width,
            height: image.height,
            strokes: [
              { ...imageStroke(image.src, box), id: freshId("stroke") },
            ],
          });
          onShowCanvas();
          onNavigate();
        })
        .catch((err: unknown) =>
          output.error(
            `Couldn't add that image — ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
    },
  });

  const folders = liveFolders(store.data);
  const ungrouped = drawingsInFolder(store.data, null);
  const favorites = favoriteDrawings(store.data);
  const archived = archivedCount(store.data);
  const privacyUrl = `${import.meta.env.BASE_URL}privacy`;

  // Drag-and-drop. The framework hook owns the gesture — recognising it,
  // following the pointer, hit-testing the registered zones — and this app owns
  // the two domain questions it asks: which drops make sense (`canDrop`, which
  // also decides which targets light up) and what each one means (`onDrop`).
  //
  // Overlapping zones resolve smallest-first, so a folder row inside the list
  // claims a drop the list would otherwise take.
  const dnd = useDragDrop<DragItem, DropTarget>({
    canDrop: (drag, target) => canDrop(store.data, drag, target),
    onDrop: (drag, target) => {
      switch (target.kind) {
        case "folder":
          store.moveDrawingToFolder(drag.id, target.id);
          break;
        case "root":
          store.moveDrawingToFolder(drag.id, null);
          break;
        case "namespace":
          if (drag.kind === "drawing")
            store.moveDrawingToNamespace(drag.id, target.slug);
          else store.moveFolderToNamespace(drag.id, target.slug);
          break;
        case "archive":
          if (drag.kind === "drawing") store.setDrawingArchived(drag.id, true);
          else store.setFolderArchived(drag.id, true);
          break;
      }
    },
  });
  const archiveZone = dnd.dropZone("archive", { kind: "archive" });
  const rootZone = dnd.dropZone("root", { kind: "root" });

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

  /** Start a new drawing: hand the question up to `App`, which owns the dialog
   *  and the drawer this panel is inside. The folder is unfolded on the way, so
   *  the drawing lands somewhere you can see when it arrives. */
  function createDrawing(folderId: string | null) {
    if (folderId !== null) ensureExpanded(folderId);
    onNewDrawing(folderId);
  }

  // One drawing row, wearing all three ways into its actions: it is a drag
  // source, it bares a swipe strip under a finger, and it opens the full action
  // menu under a right-click. The star toggle rides in the row itself (a
  // favorite is toggled often enough to deserve a tap target).
  //
  // The two destructive halves of the swipe are deliberately asymmetric.
  // Archiving is reversible and commits on the flick; deleting latches a red
  // button that then asks — the same confirmation the menu's Delete raises — so
  // a drawing is never lost to a stray sideways brush of the thumb.
  function renderDrawing(drawing: Drawing, indented: boolean): ReactNode {
    const archiveAction: RowAction = {
      label: t("menu.archive"),
      icon: <ArchiveIcon className="h-4 w-4" />,
      onSelect: () => store.setDrawingArchived(drawing.id, true),
    };
    const deleteAction: RowAction = {
      label: t("common.delete"),
      icon: <TrashIcon className="h-4 w-4" />,
      danger: true,
      onSelect: () => setPendingDelete(drawing.id),
    };
    // Filing is offered only when there is somewhere to file to — a folder to
    // move into, or (for a filed drawing) the top level to lift back to.
    const canFile = folders.length > 0 || drawing.folderId != null;
    return (
      <li key={drawing.id}>
        <DraggableRow
          handle={dnd.dragHandle({ kind: "drawing", id: drawing.id })}
        >
          <RowActionMenu
            ariaLabel={t("menu.drawingActions")}
            touchLongPress={false}
            actions={[
              {
                label: drawing.favorite
                  ? t("menu.unfavorite")
                  : t("menu.favorite"),
                icon: (
                  <StarIcon className="h-4 w-4" filled={drawing.favorite} />
                ),
                onSelect: () => store.toggleFavorite(drawing.id),
              },
              ...(canFile
                ? [
                    {
                      label: t("menu.moveToFolder"),
                      icon: <FolderOpenIcon className="h-4 w-4" />,
                      onSelect: () => setMovePicker(drawing.id),
                    },
                  ]
                : []),
              {
                label: t("common.duplicate"),
                icon: <CopyIcon className="h-4 w-4" />,
                onSelect: () => {
                  store.duplicateDrawing(drawing.id);
                  onShowCanvas();
                  onNavigate();
                },
              },
              archiveAction,
              deleteAction,
            ]}
          >
            <SwipeableRow
              leading={{
                kind: "commit",
                onCommit: archiveAction.onSelect,
                label: t("menu.archive"),
                icon: <ArchiveIcon className="h-5 w-5" />,
              }}
              actions={[deleteAction]}
            >
              <DrawingRow
                name={drawing.name.trim() || t("menu.untitled")}
                active={
                  view === "canvas" && drawing.id === store.activeDrawing?.id
                }
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
            </SwipeableRow>
          </RowActionMenu>
        </DraggableRow>
      </li>
    );
  }

  return (
    // The framework panel reserves bottom padding so its last child clears the
    // home indicator — but this PWA paints edge to edge (see `styles.css`), so
    // that reserve is dead space below whatever sits last (the rail when the
    // footer is folded, the footer when it isn't). Grow past the panel's
    // content box to reclaim it for the scrolling list; the footer and the rail
    // then carry their own bottom breathing room. The reserve is a `max()` of
    // the inset and a density-scaled floor, so reclaiming it takes the same
    // expression — subtracting only the inset left the floor behind on every
    // viewport (the sibling `contacts` app grows by the same amount). `shrink-0`
    // is what makes the growth stick: the panel is a column flex container, so
    // a child taller than its content box is otherwise shrunk straight back to
    // it and the reserve stays dead.
    <div
      ref={panelRef}
      className="relative flex min-h-0 shrink-0 flex-col [height:calc(100%+max(env(safe-area-inset-bottom),calc(1.25rem-var(--density-row-py))))]"
      // Record where a right-click landed — in the capture phase, before the
      // row's action menu opens — so the "Move to folder" submenu it spawns can
      // spring from the same spot. On the whole panel rather than the list, so
      // a starred row in the Favorites section above it is covered too.
      onContextMenuCapture={(e) => {
        movePointer.current = { x: e.clientX, y: e.clientY };
      }}
    >
      {/* The namespace switcher — and, once it is unfolded, four more drop
          targets: a row dropped onto another sketchbook is handed over to it.
          The framework draws the switcher's own drop cues; a folded switcher
          stays folded through a drag, so the choice to keep it out of the way
          survives the gesture. */}
      <NamespaceSwitcher
        namespaces={namespaces}
        activeNamespace={activeNamespace.slug}
        onSwitch={(slug: string) => onSwitchNamespace(slug)}
        onManage={onOpenNamespaces}
        dropZone={(slug) =>
          dnd.dropZone(`ns:${slug}`, { kind: "namespace", slug })
        }
        labels={{
          heading: t("namespaces.heading"),
          manage: t("namespaces.heading"),
          switchTo: (name: string) => t("namespaces.switchTo", { name }),
          expand: t("menu.showNamespaces"),
          collapse: t("menu.hideNamespaces"),
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

      {/* The scrolling list — and the "top level" drop target: a drawing dragged
          out of a folder and released anywhere in here is lifted out of it. The
          cue floats over the rows rather than inside the scroller, so it stays
          put as the list scrolls under a dragging finger. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <nav
          ref={rootZone.ref}
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
            const zone = dnd.dropZone(`folder:${folder.id}`, {
              kind: "folder",
              id: folder.id,
            });
            const archiveFolder = () =>
              store.setFolderArchived(folder.id, true);
            return (
              // The header is both a drag source (drop it on another sketchbook to
              // hand the whole group over, or on Archive to shelve it) and a drop
              // target for the drawings filed into it.
              <div key={folder.id} ref={zone.ref}>
                <DraggableRow
                  handle={dnd.dragHandle({ kind: "folder", id: folder.id })}
                >
                  <RowActionMenu
                    ariaLabel={t("menu.folderActions")}
                    touchLongPress={false}
                    actions={[
                      {
                        label: t("menu.newImageIn", { name: folder.name }),
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
                        onSelect: archiveFolder,
                      },
                      {
                        label: t("menu.deleteFolder"),
                        icon: <TrashIcon className="h-4 w-4" />,
                        danger: true,
                        onSelect: () => store.deleteFolder(folder.id),
                      },
                    ]}
                  >
                    {/* Same swipe pair as a drawing row — right archives the
                      group, left bares Delete. Deleting a folder keeps its
                      drawings (they lift to the top level), so unlike a
                      drawing's it needs no confirmation. `highlighted` is the
                      drop cue: the framework paints it *over* the sliding
                      foreground, which would otherwise hide a tint set on the
                      zone element behind it. */}
                    <SwipeableRow
                      highlighted={zone.isOver}
                      leading={{
                        kind: "commit",
                        onCommit: archiveFolder,
                        label: t("menu.archive"),
                        icon: <ArchiveIcon className="h-5 w-5" />,
                      }}
                      actions={[
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
                        addLabel={t("menu.newImageIn", { name: folder.name })}
                        onToggle={() => toggleFolder(folder.id)}
                        onAdd={() => createDrawing(folder.id)}
                      />
                    </SwipeableRow>
                  </RowActionMenu>
                </DraggableRow>
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
        {rootZone.isOver && <DropCue label={t("menu.dropToTopLevel")} />}
      </div>

      {/* The button island: New drawing / New folder / Archive / the cloud
          glyph, sharing one bordered block pinned above the footer so it falls
          under the thumb no matter how long the list is. Each cell splits the
          row's width evenly; the block owns the border, the rounding, and the
          dividers.
          It is **one row**, not two. Undo and redo used to take the second one,
          and they have gone where they belong — the canvas toolbar, beside the
          ink (see `Toolbar.tsx`) — which leaves the cloud glyph as the only
          thing that was down there. A whole row of the island for one cell was
          a row of empty surface, so the cloud moved up beside the archive and
          the second row went away: the sidebar gives the height back to the
          drawing list, which is what a sidebar is for. */}
      <div className="shrink-0 px-3 pt-2 pb-3">
        <div className="overflow-hidden rounded-md border border-line">
          <div className="flex divide-x divide-line">
            <BarButton
              label={t("menu.newImage")}
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
            {/* Also the archive drop target: a row dragged onto this cell is
                shelved. Mid-drag its label says so, so the cue reads the same
                to a screen reader as it does to the eye. */}
            <BarButton
              label={dnd.dragging ? t("menu.dropToArchive") : t("menu.archive")}
              badge={archived > 0 ? String(archived) : undefined}
              current={view === "archive"}
              dropRef={archiveZone.ref}
              over={archiveZone.isOver}
              active={archiveZone.isActive}
              onClick={() => {
                onShowArchive();
                onNavigate();
              }}
            >
              <ArchiveIcon className="h-5 w-5" />
            </BarButton>
            {/* The cloud glyph is a cell of the island, not a button seated
                inside one — the framework's `SyncStatus` is styled as a bordered
                header button, so `sync-island-cell` strips its box and lets it
                fill the cell like its neighbours (see `styles.css`). Its tone
                colour survives: that tint is the status. */}
            {syncSlot && (
              <div className="sync-island-cell flex flex-1">{syncSlot}</div>
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
          links, and Settings pinned last under the thumb. There is no "check
          for updates" row: the service worker finds a new build on its own and
          raises the toast, so the row was a button for a job nobody had to do —
          it now lives on Settings → Developer, where a hand that wants to force
          the check knows to look. The panel's own bottom reserve is reclaimed
          above, so the padding here is the whole gap around the block: the
          same `1.25rem - var(--density-row-py)` the reclaim is measured in, so
          a row's own padding plus the block's adds up to a constant 1.25rem
          however dense the theme is — and 10px more at the bottom, because
          this PWA paints edge to edge and Settings would otherwise sit on the
          screen's edge. The sibling `contacts` app spaces its footer the same
          way. */}
      {!footerCollapsed && (
        <div className="flex shrink-0 flex-col border-t border-line [padding-top:calc(1.25rem-var(--density-row-py))] [padding-bottom:calc(1.25rem-var(--density-row-py)+10px)]">
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

      {/* The cue while an image is dragged over the drawer — the same one the
          canvas shows, so "you can drop that here" reads the same in both
          places, and the two say which of them will take it. */}
      {droppingImage && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-accent bg-surface/90 p-3 text-center">
          <span className="flex items-center gap-2 text-sm text-fg-bright">
            <ImageUpIcon className="h-4 w-4 shrink-0 text-accent" />
            {t("menu.dropImage")}
          </span>
        </div>
      )}

      {/* What is in the hand right now, following the pointer — portalled to
          the body so it rides above the drawer rather than clipping to it. */}
      {dnd.dragging &&
        (() => {
          const drag = dnd.dragging;
          const drawing =
            drag.kind === "drawing"
              ? store.data.drawings.find((d) => d.id === drag.id)
              : undefined;
          const folder =
            drag.kind === "folder"
              ? folders.find((f) => f.id === drag.id)
              : undefined;
          return (
            <DragPreview
              pointer={dnd.pointer}
              label={
                drag.kind === "folder"
                  ? (folder?.name ?? "")
                  : drawing?.name.trim() || t("menu.untitled")
              }
              icon={
                drag.kind === "folder" ? (
                  <FolderIcon className="h-4 w-4" />
                ) : (
                  <CanvasIcon className="h-4 w-4" />
                )
              }
            />
          );
        })()}

      {/* The right-click "Move to folder" submenu, opened at the pointer. */}
      <MoveToFolderMenu
        folders={folders.filter(
          (f) =>
            f.id !==
            store.data.drawings.find((d) => d.id === movePicker)?.folderId,
        )}
        position={movePicker ? movePointer.current : null}
        onMove={(folderId) => {
          if (movePicker) store.moveDrawingToFolder(movePicker, folderId);
          setMovePicker(null);
        }}
        onClose={() => setMovePicker(null)}
      />

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
