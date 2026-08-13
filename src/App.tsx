// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Suspense, lazy, useEffect, useRef, useState } from "react";

import {
  useApplyTheme,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";
import {
  Sidebar,
  useEdgeSwipeOpen,
  usePersistentMenuPosition,
  useSidebarInset,
} from "@niclaslindstedt/oss-framework/sidebar";
import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";
import {
  useMediaQuery,
  useUndoRedoShortcuts,
} from "@niclaslindstedt/oss-framework/hooks";
import { LogViewer } from "@niclaslindstedt/oss-framework/logging";
import { SyncDetailsModal } from "@niclaslindstedt/oss-framework/sync";
import {
  NamespacesModal,
  applyFaviconHref,
  namespaceFaviconHref,
} from "@niclaslindstedt/oss-framework/namespaces";

import { isDarkCanvas } from "./app/canvas.ts";
import { CanvasScreen } from "./app/CanvasScreen.tsx";
import { SideMenuContent } from "./app/SideMenuContent.tsx";
import { useT } from "./app/i18n/index.ts";
import { APP_LOOK } from "./app/look.ts";
import { descendingLogStore, logStore } from "./app/log.ts";
import { cacheIdForBase } from "./app/pwa.ts";
import { resolveActiveTool } from "./app/plugins/registry.ts";
import { applyBackdropVars, useAppSettings } from "./app/useAppSettings.ts";
import { useNamespaces } from "./app/useNamespaces.ts";
import { usePaintStore } from "./app/usePaintStore.ts";
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
  const { settings, setSettings, update, setPluginEnabled } = useAppSettings();

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

  // Wide screens (≥ the smallest iPad) dock the sidebar permanently; phones
  // collapse it to a draggable drawer.
  const pinned = useMediaQuery("(min-width: 768px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [position, setPosition] = usePersistentMenuPosition(
    "paint:menu-position",
  );

  // The tool the canvas draws with, resolved against what the toolbar actually
  // offers — a tool switched off in Settings (or one from a stale settings
  // blob) can never leave the canvas holding a tool with no button.
  const tool = resolveActiveTool(settings.activeTool, settings.enabledPlugins);

  // Whether the page is a dark sheet: the canvas theme, resolved against the
  // app's own appearance. Derived once here so the screen, the PNG export, and
  // the settings tab can never disagree about which page is being painted.
  const darkCanvas = isDarkCanvas(settings.canvasTheme, appearance);

  // The real PWA update lifecycle, driven by the app's own service worker
  // (built by `pwa-plugin.ts`). In a deployed install this raises the prompt
  // when a freshly-deployed build reaches the `waiting` state; in dev
  // (`enabled: false`) it stays idle and registers nothing.
  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    enabled: !import.meta.env.DEV,
  });

  // "Open sidebar with" (Settings → General): on phones, the user picks between
  // the floating button and an inward edge swipe.
  const swipeToOpen = !pinned && settings.menuMode === "swipe";
  useEdgeSwipeOpen({
    side: position.side,
    enabled: swipeToOpen && !drawerOpen,
    onOpen: () => setDrawerOpen(true),
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

  return (
    <div className="flex h-[var(--app-height,100svh)] overflow-hidden bg-page-bg text-fg">
      <Sidebar
        pinned={pinned}
        open={drawerOpen}
        onToggle={() => setDrawerOpen((v) => !v)}
        onClose={() => setDrawerOpen(false)}
        position={position}
        onPositionChange={setPosition}
        // On phones the button shows only in "Floating button" mode; in swipe
        // mode the edge gesture opens the drawer instead.
        showButton={!pinned && !swipeToOpen}
        swipeToClose
        panelScroll={false}
        labels={{
          nav: t("menu.nav"),
          open: "Open sidebar",
          close: "Close sidebar",
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
          onNavigate={() => {
            if (!pinned) setDrawerOpen(false);
          }}
          checkingUpdate={pwa.checking}
          updateAvailable={pwa.needRefresh}
          onCheckUpdate={pwa.checkForUpdate}
        />
      </Sidebar>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <CanvasScreen
          store={store}
          sync={sync}
          settings={settings}
          update={update}
          tool={tool}
          darkCanvas={darkCanvas}
          onOpenSyncDetails={() => setSyncDetailsOpen(true)}
        />
      </main>

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
