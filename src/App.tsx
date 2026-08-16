// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Suspense, lazy, useEffect, useRef, useState } from "react";

import {
  useApplyTheme,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";
import {
  Sidebar,
  usePersistentMenuPosition,
  useSidebarInset,
} from "@niclaslindstedt/oss-framework/sidebar";
import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";
import {
  useMediaQuery,
  useUndoRedoShortcuts,
} from "@niclaslindstedt/oss-framework/hooks";
import { LogViewer } from "@niclaslindstedt/oss-framework/logging";
import {
  SyncDetailsModal,
  SyncStatus,
} from "@niclaslindstedt/oss-framework/sync";
import {
  NamespacesModal,
  applyFaviconHref,
  namespaceFaviconHref,
} from "@niclaslindstedt/oss-framework/namespaces";

import { isDarkAppearance } from "./app/canvas.ts";
import { CanvasScreen } from "./app/CanvasScreen.tsx";
import { SideMenuContent } from "./app/SideMenuContent.tsx";
import { useT } from "./app/i18n/index.ts";
import { APP_LOOK } from "./app/look.ts";
import { descendingLogStore, logStore } from "./app/log.ts";
import { cacheIdForBase } from "./app/pwa.ts";
import { adoptDrawing } from "./app/pct.ts";
import { imageStroke } from "./app/plugins/builtin/image.ts";
import { resolveActiveTool } from "./app/plugins/registry.ts";
import { setWashEngine } from "./app/plugins/wash.ts";
import { applyBackdropVars, useAppSettings } from "./app/useAppSettings.ts";
import { useNamespaces } from "./app/useNamespaces.ts";
import { freshId, usePaintStore } from "./app/usePaintStore.ts";
import { useSyncEngine } from "./app/useSyncEngine.ts";
import { status } from "./output.ts";

// Lazy: none of these are on the first-paint path (the canvas is), and each
// pulls a chunk of framework UI with it.
const SettingsModal = lazy(() =>
  import("./app/SettingsModal.tsx").then((m) => ({ default: m.SettingsModal })),
);
const CloudSetupModal = lazy(() =>
  import("./app/CloudSetupModal.tsx").then((m) => ({
    default: m.CloudSetupModal,
  })),
);
const ChangelogPanel = lazy(() =>
  import("./app/ChangelogPanel.tsx").then((m) => ({
    default: m.ChangelogPanel,
  })),
);
// The archive is the second top-level view, and most sessions never open it —
// so it stays off the first-paint path like the dialogs above.
const ArchiveScreen = lazy(() =>
  import("./app/ArchiveScreen.tsx").then((m) => ({ default: m.ArchiveScreen })),
);
// The "what is this page made of" dialog. It lives up here rather than in the
// side menu that opens it: pressing New closes the drawer, and on a phone the
// drawer *unmounts* its contents when it closes — a dialog owned by the menu
// would be dismissed by the very gesture that asked for it.
const NewImageModal = lazy(() =>
  import("./app/NewImageModal.tsx").then((m) => ({
    default: m.NewImageModal,
  })),
);

// A local-first paint PWA built from the framework's shared surface. The
// framework `Sidebar` frames the navigation (docked on wide screens, a
// draggable drawer on phones); the app owns the drawing store, the canvas
// screen, the tool plugins, the sync engine, and its tabbed Settings dialog.
export function App() {
  const t = useT();
  const [appearance, setAppearance] = useState<ThemeAppearance>(APP_LOOK);
  useApplyTheme(appearance);

  // Mirror the active density preset onto `<html>` as a discrete attribute. The
  // theme engine publishes density only as CSS variables the row components
  // consume; the attribute lets app-owned CSS key off the three levels by name.
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-density",
      appearance.ui.density,
    );
  }, [appearance.ui.density]);

  // Namespaces (workspaces). The registry + active pointer live in the app; the
  // document store keys off the active slug, so switching a namespace swaps the
  // whole sketchbook and its undo history.
  const ns = useNamespaces();
  const store = usePaintStore(ns.activeSlug);
  const {
    settings,
    setSettings,
    update,
    setPluginEnabled,
    moveTool,
    addCustomColor,
    removeCustomColor,
    setToolSize,
    savePreset,
    applyPreset,
    deletePreset,
    setToolDial,
    setToolColor,
    resetToolDials,
  } = useAppSettings();

  // The sync engine — pushes the document to a folder / Dropbox / Google Drive
  // when connected. The passphrase for an encrypted cloud copy lives only in
  // this in-memory ref; the framework's encryption wrapper reads it fresh on
  // every operation and stores it nowhere.
  const passwordRef = useRef<string | null>(null);
  const sync = useSyncEngine(store, ns.activeSlug, passwordRef);
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);

  const [namespacesOpen, setNamespacesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  // The top-level screen: the canvas, or the archive of shelved drawings and
  // folders. Both are driven from the side menu's button island.
  const [view, setView] = useState<"canvas" | "archive">("canvas");

  // A new drawing in the making: which folder it is destined for, held while the
  // dialog is up. `null` means no dialog; a pending drawing filed at the top
  // level carries `{ folderId: null }`.
  const [pendingDrawing, setPendingDrawing] = useState<{
    folderId: string | null;
  } | null>(null);

  // Wide screens (≥ the smallest iPad) dock the sidebar permanently; phones
  // collapse it to a draggable drawer. Either way the header's hamburger is the
  // way to it — on a wide screen it folds the docked column away for the canvas,
  // on a phone it opens the drawer, and `toggleMenu` below is the one place that
  // knows which of the two it is doing.
  const wide = useMediaQuery("(min-width: 768px)");
  const [menuFolded, setMenuFolded] = useState(false);
  const pinned = wide && !menuFolded;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuShowing = pinned || drawerOpen;
  const toggleMenu = () => {
    if (wide) setMenuFolded((folded) => !folded);
    else setDrawerOpen((open) => !open);
  };

  // …and the right-hand panel docks where there is room for a second column
  // beside the canvas. A wider bar than the sidebar's on purpose: at 768 the
  // two docked columns leave a phone-sized window to draw in.
  const dockPanel = useMediaQuery("(min-width: 1024px)");
  const [position, setPosition] = usePersistentMenuPosition(
    "paint:menu-position",
  );

  // The tool the canvas draws with, resolved against what the toolbar actually
  // offers — a tool switched off in Settings (or one from a stale settings
  // blob) can never leave the canvas holding a tool with no button.
  const tool = resolveActiveTool(settings.activeTool, settings.enabledPlugins);

  // Whether a page that has pinned no colour of its own is a dark sheet — the
  // app's own appearance, and nothing else. Derived once here so the screen,
  // the PNG export and the dialogs can never disagree about which page is being
  // painted.
  const darkCanvas = isDarkAppearance(appearance);

  // The real PWA update lifecycle, driven by the app's own service worker
  // (built by `pwa-plugin.ts`). In a deployed install this raises the prompt
  // when a freshly-deployed build reaches the `waiting` state; in dev
  // (`enabled: false`) it stays idle and registers nothing.
  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    enabled: !import.meta.env.DEV,
  });

  // Keyboard undo/redo over the same history the sidebar buttons drive
  // (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z / Ctrl+Y). Gated off while the phone drawer
  // owns the keyboard over the canvas.
  useUndoRedoShortcuts({
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    onUndo: store.undo,
    onRedo: store.redo,
    enabled: pinned || !drawerOpen,
  });

  // Publish the docked sidebar's footprint as CSS variables so viewport-fixed
  // overlays (the `UpdateToast`) centre over the content band.
  useSidebarInset(pinned, position.side);

  // Log capture follows the Developer-tab toggle.
  useEffect(() => {
    logStore.setCaptureEnabled(settings.captureLogs || settings.devMode);
  }, [settings.captureLogs, settings.devMode]);

  // Project the persisted modal-backdrop knobs onto `<html>` as the CSS
  // variables the scrim rule in `styles.css` reads.
  useEffect(() => {
    applyBackdropVars(settings);
    // Keyed on the two backdrop knobs, not the whole settings object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.modalBackdropDarkness, settings.modalBackdropBlur]);

  // Put the chosen watercolour engine in force. It is app-wide rather than
  // threaded through each repaint so that every surface painting this document
  // — the screen, the mark cache, the thumbnails, the page the dropper reads,
  // the exported PNG — cannot disagree about it (see `plugins/wash.ts`).
  useEffect(() => {
    setWashEngine(settings.washEngine);
  }, [settings.washEngine]);

  useEffect(() => {
    status("App started");
  }, []);

  // Re-badge the browser tab with the active namespace's glyph, so a glance at
  // the tab strip tells you which sketchbook you're in; without one it wears
  // the app's own mark.
  const activeNamespace = ns.activeNamespace;
  useEffect(() => {
    applyFaviconHref(
      namespaceFaviconHref(
        activeNamespace,
        `${import.meta.env.BASE_URL}icons/icon.svg`,
        { defaultColor: "#fbbf24", badge: { background: "#0b0d10" } },
      ),
    );
  }, [activeNamespace]);

  // The cloud glyph, rendered as the last cell of the side menu's button
  // island — one sync affordance for the whole app rather than one per screen
  // header. It shows on every backend, the on-device one included: it is the
  // way *in* to the sync command centre, so hiding it until a backend is
  // connected would hide the door as well as the room.
  const syncSlot = (
    <SyncStatus
      providerName={sync.providerName}
      status={sync.status}
      dirty={sync.dirty}
      offline={sync.offline}
      onOpenDetails={() => {
        setDrawerOpen(false);
        setSyncDetailsOpen(true);
      }}
      labels={{ syncedTo: (name) => t("sync.syncedTo", { name }) }}
    />
  );

  return (
    <div className="flex h-[var(--app-height,100svh)] overflow-hidden bg-page-bg text-fg">
      <Sidebar
        pinned={pinned}
        open={drawerOpen}
        onToggle={() => setDrawerOpen((v) => !v)}
        onClose={() => setDrawerOpen(false)}
        position={position}
        onPositionChange={setPosition}
        // No floating button any more: the canvas header's hamburger is the one
        // way in, and it costs the page no corner (see `CanvasScreen`).
        showButton={false}
        swipeToClose
        panelScroll={false}
        labels={{
          nav: t("menu.nav"),
          open: t("menu.open"),
          close: t("menu.close"),
        }}
      >
        <SideMenuContent
          store={store}
          activeNamespace={ns.activeNamespace}
          namespaces={ns.list}
          onSwitchNamespace={ns.switchTo}
          onOpenNamespaces={() => setNamespacesOpen(true)}
          onOpenSettings={() => {
            setDrawerOpen(false);
            setSettingsOpen(true);
          }}
          onOpenChangelog={() => {
            setDrawerOpen(false);
            setChangelogOpen(true);
          }}
          // New drawing: the drawer gets out of the way first — the dialog is
          // the thing being answered, and on a phone the menu would otherwise
          // sit behind it with the question in front of a list nobody is
          // reading any more.
          onNewDrawing={(folderId) => {
            setDrawerOpen(false);
            setPendingDrawing({ folderId });
          }}
          onNavigate={() => {
            if (!pinned) setDrawerOpen(false);
          }}
          view={view}
          onShowArchive={() => setView("archive")}
          onShowCanvas={() => setView("canvas")}
          syncSlot={syncSlot}
          checkingUpdate={pwa.checking}
          updateAvailable={pwa.needRefresh}
          onCheckUpdate={pwa.checkForUpdate}
        />
      </Sidebar>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {view === "archive" ? (
          <Suspense fallback={null}>
            <ArchiveScreen
              store={store}
              onShowCanvas={() => setView("canvas")}
            />
          </Suspense>
        ) : (
          <CanvasScreen
            store={store}
            settings={settings}
            update={update}
            // The toolbar's pickers keep what the user mixes and adds.
            palette={{
              addColor: addCustomColor,
              removeColor: removeCustomColor,
              setSize: setToolSize,
              savePreset,
              applyPreset,
              deletePreset,
              setDial: setToolDial,
              setColor: setToolColor,
              resetDials: resetToolDials,
            }}
            tool={tool}
            darkCanvas={darkCanvas}
            onToggleMenu={toggleMenu}
            menuOpen={menuShowing}
            dockPanel={dockPanel}
            // The disk button, and only on a backend that can take a layer
            // tree — the on-device sketchbook and an encrypted cloud copy both
            // hand back `canSaveLayers: false`, which takes the button out of
            // the header rather than parking a dead one in it.
            layerSave={
              sync.canSaveLayers
                ? {
                    dirty: sync.layersDirty,
                    status: sync.layerStatus,
                    save: sync.saveLayers,
                  }
                : null
            }
          />
        )}
      </main>

      {/* What a new image is made of, and how big it is. Mounted only while
          one is pending, so each is asked fresh rather than reopening on the
          last answer. */}
      {pendingDrawing && (
        <Suspense fallback={null}>
          <NewImageModal
            folderName={
              store.data.folders.find((f) => f.id === pendingDrawing.folderId)
                ?.name
            }
            dark={darkCanvas}
            onCancel={() => setPendingDrawing(null)}
            // The size, the colour and the sheet are all part of making the
            // page rather than edits to it, so they arrive together and the
            // drawing is created finished (see `NewImageModal`). `page` holds
            // only the answers that were actually given, so a plain page
            // carries neither a ground nor a colour — which is what every
            // drawing made before either existed is.
            onCreate={(size, page) => {
              store.addDrawing("", pendingDrawing.folderId, {
                ...size,
                ...page,
              });
              setPendingDrawing(null);
              setView("canvas");
            }}
            // A drawing made from a picture is the size of the picture, and it
            // opens with the picture already on it as one ordinary mark — the
            // same stroke a drop onto the canvas would have left.
            onCreateFromImage={(image, name, page) => {
              store.addDrawing(name, pendingDrawing.folderId, {
                width: image.width,
                height: image.height,
                ...page,
                strokes: [
                  {
                    ...imageStroke(image.src, {
                      x: 0,
                      y: 0,
                      width: image.width,
                      height: image.height,
                    }),
                    id: freshId("stroke"),
                  },
                ],
              });
              setPendingDrawing(null);
              setView("canvas");
            }}
            // A `.pct` arrives as a whole drawing — its own page size, its own
            // stack, its own marks — so it is filed as it is rather than cut to
            // anything. Only the ids are re-minted, by the store, so opening
            // the same file twice gives two drawings rather than one drawing
            // arguing with itself.
            onOpenPct={(opened, name) => {
              store.addDrawing(
                name,
                pendingDrawing.folderId,
                adoptDrawing(opened, () => freshId("stroke")),
              );
              setPendingDrawing(null);
              setView("canvas");
            }}
          />
        </Suspense>
      )}

      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsModal
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            appearance={appearance}
            setAppearance={setAppearance}
            settings={settings}
            commitSettings={setSettings}
            setPluginEnabled={setPluginEnabled}
            moveTool={moveTool}
            updateLive={update}
            darkCanvas={darkCanvas}
            store={store}
            sync={sync}
          />
        </Suspense>
      )}

      {/* The connect-time replace-or-adopt prompt — opens when a freshly
          connected backend already holds drawings that differ from this
          device's copy. The engine owns the state and holds auto-save until a
          side is chosen. */}
      {sync.pendingSetup && (
        <Suspense fallback={null}>
          <CloudSetupModal
            pending={sync.pendingSetup}
            onResolve={sync.resolveSetup}
          />
        </Suspense>
      )}

      {/* The framework's PWA "a new version is ready" prompt, fed from the real
          `usePwaUpdate()` state above. */}
      <UpdateToast
        needRefresh={pwa.needRefresh}
        incomingVersion={pwa.incomingVersion}
        onReload={() => pwa.reload()}
        onDismiss={() => pwa.dismiss()}
      />

      {/* The sync command centre — opened by the canvas header's `SyncStatus`
          glyph. Purely presentational: the app's engine owns the state and the
          actions; the framework lays them out. */}
      <SyncDetailsModal
        open={syncDetailsOpen}
        onClose={() => setSyncDetailsOpen(false)}
        providerName={sync.providerName}
        backendKind={sync.backendKind}
        location={sync.location}
        encrypted={sync.encrypted}
        status={sync.status}
        dirty={sync.dirty}
        offline={sync.offline}
        onSaveNow={sync.saveNow}
        onReload={sync.reload}
        onReconnect={sync.reconnect}
        onCheckConnection={sync.checkConnection}
        logPanel={
          settings.devMode ? (
            <LogViewer store={descendingLogStore} />
          ) : undefined
        }
        labels={{
          cloudSync: t("sync.cloudSync"),
          close: t("common.close"),
          status: t("sync.status"),
          backend: t("sync.backend"),
          fileLocation: t("sync.fileLocation"),
          encryptionLabel: t("sync.encryptionLabel"),
          encryptionOn: t("sync.encryptionOn"),
          encryptionOff: t("sync.encryptionOff"),
          reloadFromBackend: t("sync.reloadFromBackend"),
          saveNow: t("sync.saveNow"),
          tryAgain: t("sync.tryAgain"),
          reconnect: (name) => t("sync.reconnect", { name }),
          openIn: (name) => t("sync.openIn", { name }),
          checkConnection: t("sync.checkConnection"),
          viewSyncLog: t("sync.viewSyncLog"),
          hideSyncLog: t("sync.hideSyncLog"),
          syncingNow: t("sync.syncingNow"),
          failedHeading: t("sync.failedHeading"),
          throttledHeading: t("sync.throttledHeading"),
          throttledDetail: (name) => t("sync.throttledDetail", { name }),
          reauthHeading: t("sync.reauthHeading"),
          reauthDetail: (name) => t("sync.reauthDetail", { name }),
          conflictHeading: t("sync.conflictHeading"),
          conflictDetail: t("sync.conflictDetail"),
          pendingHeading: t("sync.pendingHeading"),
          pendingDetail: (name) => t("sync.pendingDetail", { name }),
          offlineHeading: t("sync.offlineHeading"),
          offlineDetail: (name) => t("sync.offlineDetail", { name }),
          syncedTo: (name) => t("sync.syncedTo", { name }),
          checkPinging: (name) => t("sync.checkPinging", { name }),
          checkStillOffline: (name) => t("sync.checkStillOffline", { name }),
          checkAuthExpired: (name) => t("sync.checkAuthExpired", { name }),
          failedDetailFallback: (name) =>
            t("sync.failedDetailFallback", { name }),
        }}
      />

      {/* The namespaces manager — create / switch / rename / restyle / delete
          sketchbooks. Presentational: the app owns the registry; the framework
          owns the dialog. */}
      <NamespacesModal
        open={namespacesOpen}
        onClose={() => setNamespacesOpen(false)}
        namespaces={ns.list}
        activeNamespace={ns.activeSlug}
        onSwitch={ns.switchTo}
        onCreate={ns.create}
        onRename={ns.rename}
        onSetAppearance={ns.setAppearance}
        onRemove={ns.remove}
        labels={{
          heading: t("namespaces.heading"),
          blurb: t("namespaces.blurb"),
          newAction: t("namespaces.newAction"),
          namePlaceholder: t("namespaces.namePlaceholder"),
          nameLabel: t("namespaces.nameLabel"),
          create: t("namespaces.create"),
          nameRequired: t("namespaces.nameRequired"),
          colorLabel: t("namespaces.colorLabel"),
          glyphLabel: t("namespaces.glyphLabel"),
          glyphNone: t("namespaces.glyphNone"),
          save: t("namespaces.save"),
          cancel: t("namespaces.cancel"),
          renameAction: t("namespaces.renameAction"),
          deleteAction: t("namespaces.deleteAction"),
          delete: t("namespaces.delete"),
          deleteConfirm: (name) => t("namespaces.deleteConfirm", { name }),
          switchTo: (name) => t("namespaces.switchTo", { name }),
          defaultBadge: t("namespaces.defaultBadge"),
          close: t("common.close"),
        }}
      />

      {/* The "What's new" dialog — opened from the sidebar footer. The app
          inlines the CHANGELOG and the feature docs at build time. */}
      {changelogOpen && (
        <Suspense fallback={null}>
          <ChangelogPanel
            open={changelogOpen}
            onClose={() => setChangelogOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
