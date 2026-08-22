// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import {
  Button,
  CloseIcon,
  CodeIcon,
  CogIcon,
  CropIcon,
  DatabaseIcon,
  DownloadIcon,
  FloatingPanel,
  MenuIcon,
  Modal,
  PaletteIcon,
  ScrollTextIcon,
  SlidersIcon,
  type IconProps,
} from "@niclaslindstedt/oss-framework/components";
import { type ThemeAppearance } from "@niclaslindstedt/oss-framework/theme";
import { type PwaUpdate } from "@niclaslindstedt/oss-framework/pwa";

import { GaugeIcon, SidePanelIcon, ToolboxIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { APP_LOOK } from "./look.ts";
import {
  LIVE_SETTINGS,
  defaultSettings,
  withLiveSettings,
  type AppSettings,
} from "./useAppSettings.ts";
import type { PaintStore } from "./usePaintStore.ts";
import type { SyncEngine } from "./useSyncEngine.ts";
import {
  AppearanceTab,
  DeveloperTab,
  GeneralTab,
  LogsTab,
  StorageTab,
} from "./settings/tabs.tsx";
import { CanvasTab } from "./settings/canvas.tsx";
import { DownloadTab } from "./settings/download.tsx";
import { PanelTab } from "./settings/panel.tsx";
import { PerformanceTab } from "./settings/performance.tsx";
import { ToolsTab } from "./settings/tools.tsx";

// The app's tabbed Settings modal — composed from the framework's `Modal` and
// `FloatingPanel` primitives plus the theme module's `AppearancePicker`. On
// desktop a vertical tab rail owns section selection beside the scrolling tab
// panel; on mobile the rail collapses and a header burger opens the same
// sections as a `FloatingPanel` menu. A Reset / Cancel / Save footer lives in
// the `Modal`'s footer slot.
//
// Two kinds of setting live here, and they commit differently:
//   - preferences (General, Appearance, Download, Developer) are staged in a
//     draft and only committed on Save; Cancel reverts;
//   - device state (the Tools switchboard, the storage backend) applies live —
//     there is nothing to roll back, and a tool you switch on should appear in
//     the toolbar behind the dialog immediately.
//
// What one *page* is made of is not here at all: its size, its colour and its
// sheet are answered once, in the dialog that creates a drawing (see
// `NewImageModal`), and stored on the drawing rather than as a preference. What
// the Canvas tab holds is the shelf that dialog offers — which sizes it lists,
// and the named pages the user has set up beside them (see `canvasPresets.ts`).

export type SettingsTab =
  | "general"
  | "appearance"
  | "tools"
  | "panel"
  | "canvas"
  | "download"
  | "storage"
  | "performance"
  | "developer"
  | "logs";

// A typed message key (the argument `useT`'s `t` accepts), so each tab's label
// stays a compile-checked catalog path.
type TKey = Parameters<ReturnType<typeof useT>>[0];

type TabDef = {
  id: SettingsTab;
  labelKey: TKey;
  icon: (p: IconProps) => ReactNode;
};

const TABS: TabDef[] = [
  { id: "general", labelKey: "settings.tabs.general", icon: SlidersIcon },
  { id: "appearance", labelKey: "settings.tabs.appearance", icon: PaletteIcon },
  { id: "tools", labelKey: "settings.tabs.tools", icon: ToolboxIcon },
  { id: "panel", labelKey: "settings.tabs.panel", icon: SidePanelIcon },
  { id: "canvas", labelKey: "settings.tabs.canvas", icon: CropIcon },
  { id: "download", labelKey: "settings.tabs.download", icon: DownloadIcon },
  { id: "storage", labelKey: "settings.tabs.storage", icon: DatabaseIcon },
  // Last of the everyday pages and first of the technical ones: what the app
  // spends to paint, rather than what it paints (see `settings/performance.tsx`).
  {
    id: "performance",
    labelKey: "settings.tabs.performance",
    icon: GaugeIcon,
  },
  { id: "developer", labelKey: "settings.tabs.developer", icon: CodeIcon },
  { id: "logs", labelKey: "settings.tabs.logs", icon: ScrollTextIcon },
];

type Props = {
  open: boolean;
  onClose: () => void;
  /** Which section the dialog opens on. Defaults to General — the way in from
   *  the side menu, which is asking for "settings" rather than for one of them.
   *  The toolbar's "more tools" button asks for `"tools"` by name: it is a
   *  shortcut to the switchboard, and landing on General would make the user
   *  find it again every time (see `Toolbar.tsx`). */
  initialTab?: SettingsTab;
  appearance: ThemeAppearance;
  // Live-preview setter — appearance edits paint the whole app immediately.
  setAppearance: (next: ThemeAppearance) => void;
  settings: AppSettings;
  commitSettings: (next: AppSettings) => void;
  setPluginEnabled: (id: string, enabled: boolean) => void;
  /** Reorder the toolbar — applied live, like the switches beside it. */
  moveTool: (order: readonly string[], from: number, to: number) => void;
  /** The right-hand panel's switchboard, applied live for the same reason: it
   *  is the surface *behind* this dialog. */
  setPanelSectionEnabled: (id: string, enabled: boolean) => void;
  setPanelItemEnabled: (id: string, enabled: boolean) => void;
  movePanelSection: (
    order: readonly string[],
    from: number,
    to: number,
  ) => void;
  /** Commit one setting straight through, bypassing the draft — for the tabs
   *  whose controls apply live (see the note at the top of this file). */
  updateLive: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  /** Whether the page is currently a dark sheet. */
  darkCanvas: boolean;
  store: PaintStore;
  sync: SyncEngine;
  /** The live PWA update lifecycle, for the Developer tab's "check for updates"
   *  row. `App` owns the one registration; this is a window onto it. */
  pwa: PwaUpdate;
};

export function SettingsModal({
  open,
  onClose,
  initialTab = "general",
  appearance,
  setAppearance,
  settings,
  commitSettings,
  setPluginEnabled,
  moveTool,
  setPanelSectionEnabled,
  setPanelItemEnabled,
  movePanelSection,
  updateLive,
  darkCanvas,
  store,
  sync,
  pwa,
}: Props) {
  const t = useT();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const menuRef = useRef<HTMLButtonElement>(null);
  // The appearance to restore if the user cancels — captured on open.
  const snapshot = useRef<ThemeAppearance>(appearance);

  // On open, snapshot the live appearance and seed the settings draft.
  useEffect(() => {
    if (!open) return;
    snapshot.current = appearance;
    setDraft(settings);
    setTab(initialTab);
    setMenuOpen(false);
    // Only re-run when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // The Developer tab only exists while developer mode is on; the Logs tab only
  // while log capture is on. If the active tab vanishes, fall back to General.
  const visible = TABS.filter(
    (tabItem) =>
      (tabItem.id !== "developer" || draft.devMode) &&
      (tabItem.id !== "logs" || draft.captureLogs),
  );
  const activeTab = visible.some((tabItem) => tabItem.id === tab)
    ? tab
    : "general";
  const activeDef =
    visible.find((tabItem) => tabItem.id === activeTab) ?? visible[0]!;
  const ActiveIcon = activeDef.icon;

  function save() {
    // The Tools tab writes straight through to the committed settings — a tool
    // you switch on has to reach the toolbar immediately — so the draft's copy
    // of those fields is the stale one this dialog opened with. Carry every
    // live value across, or saving any other tab would silently revert them —
    // which is `LIVE_SETTINGS`, not a list written out here, so a live setting
    // added later cannot be forgotten by this line.
    commitSettings(withLiveSettings(draft, settings));
    onClose();
  }
  function cancel() {
    setAppearance(snapshot.current); // discard the live appearance preview
    onClose();
  }
  function reset() {
    const fresh = defaultSettings();
    setAppearance(APP_LOOK);
    // The plugin switchboard applies live, so a reset has to apply there live
    // too — leaving it in the draft would show the switches in one state while
    // the toolbar behind the dialog offered another. "Defaults" here means the
    // tools a fresh install ships with, not none of them.
    const wanted = new Set(fresh.enabledPlugins);
    for (const id of settings.enabledPlugins) {
      if (!wanted.has(id)) setPluginEnabled(id, false);
    }
    for (const id of wanted) setPluginEnabled(id, true);
    // …and so does everything else that applies live — the toolbar's order, the
    // watercolour engine. Driven off the same list Save reads, so "defaults"
    // here means the same set of settings in both directions.
    for (const key of LIVE_SETTINGS) {
      if (key === "enabledPlugins") continue; // done above, switch by switch
      updateLive(key, fresh[key]);
    }
    setDraft(fresh);
  }

  return (
    <Modal
      open={open}
      onClose={cancel}
      labelledBy="settings-title"
      closeLabel={t("common.cancel")}
      footer={
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <Button variant="secondary" onClick={reset}>
            {t("common.resetToDefaults")}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={cancel}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={save}>
              {t("common.save")}
            </Button>
          </div>
        </footer>
      }
    >
      {/* Header. On mobile the burger + active-tab label form one toggle that
          opens the section menu; on desktop the left rail owns selection and
          the header shows the static "Settings" title. The h2 stays mounted
          (sr-only on mobile) so `aria-labelledby` always resolves. */}
      <header className="relative flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative sm:hidden">
            <button
              ref={menuRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t("settings.chooseSection")}
              className={`-ml-1 inline-flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm font-bold tracking-wide text-fg-bright ${
                menuOpen
                  ? "border-accent bg-accent/15"
                  : "border-transparent hover:border-line hover:bg-surface-2"
              }`}
            >
              <MenuIcon className="h-[18px] w-[18px] text-muted" />
              <span className="inline-flex shrink-0 text-accent">
                <ActiveIcon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">{t(activeDef.labelKey)}</span>
            </button>
            <FloatingPanel
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              triggerRef={menuRef}
              placement={{
                width: { kind: "min", minPx: 192 },
                anchor: "left",
                coordinateSpace: "viewport",
              }}
            >
              <div role="menu" className="flex w-full flex-col gap-0.5 p-2">
                {visible.map((tabItem) => {
                  const Icon = tabItem.icon;
                  const isActive = tabItem.id === activeTab;
                  return (
                    <button
                      key={tabItem.id}
                      type="button"
                      role="menuitem"
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => {
                        setTab(tabItem.id);
                        setMenuOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface ${
                        isActive ? "font-bold text-accent" : "text-fg"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{t(tabItem.labelKey)}</span>
                    </button>
                  );
                })}
              </div>
            </FloatingPanel>
          </div>
          <h2
            id="settings-title"
            className="sr-only text-sm font-bold tracking-wide text-fg-bright sm:not-sr-only"
          >
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex shrink-0 text-accent">
                <CogIcon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">{t("settings.title")}</span>
            </span>
          </h2>
        </div>
        <button
          type="button"
          onClick={cancel}
          aria-label={t("common.close")}
          className="-mr-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      {/* Body: desktop tab rail (hidden on mobile, where the burger takes over)
          beside the scrolling tab panel. */}
      <div className="flex flex-1 overflow-hidden">
        <TabSidebar
          tabs={visible}
          activeTab={activeTab}
          onSelect={setTab}
          label={t("settings.sections")}
          t={t}
        />

        {/* `settings-body` scopes the density-driven card spacing (see
            styles.css) so the Appearance → Density knob tightens or loosens the
            settings cards themselves. `relative` makes this the containing
            block for its descendants' absolutely-positioned bits — chiefly each
            `ToggleRow`'s `sr-only` checkbox. */}
        <div
          role="tabpanel"
          id={`settings-tabpanel-${activeTab}`}
          aria-labelledby={`settings-tab-${activeTab}`}
          tabIndex={0}
          className="settings-body relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4"
        >
          {activeTab === "general" && (
            <GeneralTab settings={draft} update={update} />
          )}
          {activeTab === "performance" && (
            <PerformanceTab settings={draft} update={update} />
          )}
          {activeTab === "appearance" && (
            <AppearanceTab
              appearance={appearance}
              setAppearance={setAppearance}
              draft={draft}
              committed={settings}
              update={update}
            />
          )}
          {activeTab === "tools" && (
            <ToolsTab
              settings={settings}
              setPluginEnabled={setPluginEnabled}
              moveTool={moveTool}
            />
          )}
          {activeTab === "panel" && (
            <PanelTab
              settings={settings}
              setPanelSectionEnabled={setPanelSectionEnabled}
              setPanelItemEnabled={setPanelItemEnabled}
              movePanelSection={movePanelSection}
              // Switching the layer stack off is a promise about the document —
              // one layer per drawing — and this is where the promise is kept.
              // The settings page asked and was answered; what "no layers" then
              // means to a sketchbook is the store's to carry out.
              onSectionDisabled={(id) => {
                if (id === "layers") store.flattenLayers();
              }}
            />
          )}
          {activeTab === "canvas" && (
            <CanvasTab
              settings={settings}
              update={updateLive}
              dark={darkCanvas}
            />
          )}
          {activeTab === "download" && (
            <DownloadTab settings={draft} update={update} />
          )}
          {activeTab === "storage" && (
            <StorageTab store={store} sync={sync} darkCanvas={darkCanvas} />
          )}
          {activeTab === "developer" && (
            <DeveloperTab
              settings={draft}
              update={update}
              pwa={pwa}
              drawing={store.activeDrawing ?? null}
            />
          )}
          {activeTab === "logs" && <LogsTab />}
        </div>
      </div>
    </Modal>
  );
}

// Desktop-only vertical tab rail (hidden below `sm`, where the header burger
// takes over). A WAI-ARIA tablist with roving tabindex and arrow-key
// navigation; activation follows focus to match the mouse / touch behaviour.
function TabSidebar({
  tabs,
  activeTab,
  onSelect,
  label,
  t,
}: {
  tabs: TabDef[];
  activeTab: SettingsTab;
  onSelect: (id: SettingsTab) => void;
  label: string;
  t: ReturnType<typeof useT>;
}) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(
    e: ReactKeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) {
    if (
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "Home" &&
      e.key !== "End"
    )
      return;
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowUp") next = idx - 1;
    else if (e.key === "ArrowDown") next = idx + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    const wrapped = (next + tabs.length) % tabs.length;
    const nextDef = tabs[wrapped];
    if (!nextDef) return;
    onSelect(nextDef.id);
    buttonRefs.current[nextDef.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label={label}
      className="hidden w-44 shrink-0 flex-col gap-0.5 overflow-y-auto overscroll-contain border-r border-line bg-surface-3 p-2 sm:flex"
    >
      {tabs.map((tabItem, idx) => {
        const Icon = tabItem.icon;
        const active = tabItem.id === activeTab;
        return (
          <button
            key={tabItem.id}
            ref={(el) => {
              buttonRefs.current[tabItem.id] = el;
            }}
            type="button"
            role="tab"
            id={`settings-tab-${tabItem.id}`}
            aria-controls={`settings-tabpanel-${tabItem.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tabItem.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
              active
                ? "bg-accent/15 font-bold text-accent"
                : "text-fg hover:bg-surface-2"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{t(tabItem.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
