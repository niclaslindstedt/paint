// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useState } from "react";

import {
  Button,
  Section,
  SegmentedControl,
  SpinnerIcon,
  ToggleRow,
  UnlockGate,
} from "@niclaslindstedt/oss-framework/components";
import {
  AppearancePicker,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";
import { LogViewer } from "@niclaslindstedt/oss-framework/logging";
import { useStandaloneMobile } from "@niclaslindstedt/oss-framework/pwa";
import {
  downloadBlob,
  downloadText,
  MIME_JSON,
} from "@niclaslindstedt/oss-framework/files";

import {
  defaultInk,
  isDarkCanvas,
  resolvePageColor,
  type CanvasTheme,
} from "../canvas.ts";
import { drawingToPng, exportFileName } from "../export.ts";
import { useT } from "../i18n/index.ts";
import { log, logStore } from "../log.ts";
import { serializeDoc } from "../migrations.ts";
import { allPlugins } from "../plugins/registry.ts";
import { applyBackdropVars } from "../useAppSettings.ts";
import type {
  AppSettings,
  BackdropBlur,
  BackdropDarkness,
} from "../useAppSettings.ts";
import type { PaintStore } from "../usePaintStore.ts";
import {
  DROPBOX_APP_KEY,
  FOLDER_BACKEND_AVAILABLE,
  GOOGLE_CLIENT_ID,
  PROVIDER_NAMES,
  type SyncBackendId,
  type SyncEngine,
} from "../useSyncEngine.ts";
import { LanguagePicker } from "./shared.tsx";

type Update = <K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
) => void;

// --- Appearance ------------------------------------------------------------

// The framework's `AppearancePicker` (theme, font, the radius / density /
// border / component knobs) plus the app-owned dialog backdrop controls. The
// picker edits the live appearance; the backdrop knobs are staged in the
// settings draft like every other tab, but preview live — the effect below
// projects the *draft* values while the tab is mounted so the open Settings
// dialog dims and blurs against itself, and restores the committed values on
// cancel / tab switch.
export function AppearanceTab({
  appearance,
  setAppearance,
  draft,
  committed,
  update,
}: {
  appearance: ThemeAppearance;
  setAppearance: (next: ThemeAppearance) => void;
  draft: AppSettings;
  committed: AppSettings;
  update: Update;
}) {
  const t = useT();

  useEffect(() => {
    applyBackdropVars(draft);
    return () => applyBackdropVars(committed);
    // Keyed on the backdrop knobs of each, not the whole objects — the draft is
    // a fresh object on every keystroke elsewhere in Settings, which would
    // otherwise thrash this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    draft.modalBackdropDarkness,
    draft.modalBackdropBlur,
    committed.modalBackdropDarkness,
    committed.modalBackdropBlur,
  ]);

  const darknessOptions = [
    { value: "none" as const, label: t("settings.appearance.levelNone") },
    { value: "subtle" as const, label: t("settings.appearance.levelSubtle") },
    { value: "medium" as const, label: t("settings.appearance.levelMedium") },
    { value: "dark" as const, label: t("settings.appearance.darknessDark") },
  ];
  const blurOptions = [
    { value: "none" as const, label: t("settings.appearance.levelNone") },
    { value: "subtle" as const, label: t("settings.appearance.levelSubtle") },
    { value: "medium" as const, label: t("settings.appearance.levelMedium") },
    { value: "strong" as const, label: t("settings.appearance.levelStrong") },
  ];

  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        {t("settings.appearance.intro")}
      </p>

      <AppearancePicker appearance={appearance} onChange={setAppearance} />

      <Section title={t("settings.appearance.backdropTitle")}>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("settings.appearance.backdropDarkness")}
          </span>
          <SegmentedControl<BackdropDarkness>
            value={draft.modalBackdropDarkness}
            options={darknessOptions}
            onChange={(next) => update("modalBackdropDarkness", next)}
            ariaLabel={t("settings.appearance.backdropDarkness")}
          />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("settings.appearance.backdropBlur")}
          </span>
          <SegmentedControl<BackdropBlur>
            value={draft.modalBackdropBlur}
            options={blurOptions}
            onChange={(next) => update("modalBackdropBlur", next)}
            ariaLabel={t("settings.appearance.backdropBlur")}
          />
        </div>
      </Section>
    </div>
  );
}

// --- General ---------------------------------------------------------------

export function GeneralTab({
  settings,
  update,
}: {
  settings: AppSettings;
  update: Update;
}) {
  const t = useT();
  const modeOptions = [
    { value: "swipe" as const, label: t("settings.general.optionSwipe") },
    { value: "button" as const, label: t("settings.general.optionButton") },
  ];
  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.general.intro")}</p>

      <Section title={t("settings.general.languageTitle")}>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("settings.general.chooseLanguage")}
          </span>
          <LanguagePicker />
          <p className="text-xs text-muted">
            {t("settings.general.languageHint")}
          </p>
        </div>
      </Section>

      <Section title={t("settings.general.sidebarTitle")}>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("settings.general.openSidebarWith")}
          </span>
          <SegmentedControl
            value={settings.menuMode}
            options={modeOptions}
            onChange={(next) => update("menuMode", next)}
            ariaLabel={t("settings.general.openSidebarWith")}
          />
          <p className="text-xs text-muted">
            {t("settings.general.sidebarHint")}
          </p>
        </div>
      </Section>

      <Section title={t("settings.general.developerTitle")}>
        <ToggleRow
          label={t("settings.general.developerMode")}
          hint={t("settings.general.developerModeHint")}
          checked={settings.devMode}
          onChange={(next) => update("devMode", next)}
        />
      </Section>
    </div>
  );
}

// --- Canvas ----------------------------------------------------------------

// The page you draw on: whether it is a light or a dark sheet (a preference,
// applied live), and whether the open drawing pins a colour of its own
// (document state). The grid is a preference too, staged in the draft.
export function CanvasTab({
  settings,
  update,
  store,
  appearance,
}: {
  settings: AppSettings;
  update: Update;
  store: PaintStore;
  appearance: ThemeAppearance;
}) {
  const t = useT();
  // The canvas theme applies live rather than on Save: it repaints the page
  // behind the dialog, which is the only way to judge the choice.
  const dark = isDarkCanvas(settings.canvasTheme, appearance);
  const pinned = store.activeDrawing?.background;
  const themeOptions = [
    { value: "auto" as const, label: t("settings.canvas.themeAuto") },
    { value: "light" as const, label: t("settings.canvas.themeLight") },
    { value: "dark" as const, label: t("settings.canvas.themeDark") },
  ];
  // "Follow the theme" first, then the pinnable page colours. A pin overrides
  // the theme for this drawing only, and travels with it when it syncs.
  const swatches = [
    "#ffffff",
    "#f8fafc",
    "#fef3c7",
    "#161a20",
    "#000000",
    "#0f172a",
  ];

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.canvas.intro")}</p>

      <Section title={t("settings.canvas.themeTitle")}>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("settings.canvas.themeLabel")}
          </span>
          <SegmentedControl<CanvasTheme>
            value={settings.canvasTheme}
            options={themeOptions}
            onChange={(next) => update("canvasTheme", next)}
            ariaLabel={t("settings.canvas.themeLabel")}
          />
          <p className="text-xs text-muted">{t("settings.canvas.themeHint")}</p>
        </div>
      </Section>

      <Section title={t("settings.canvas.pageTitle")}>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("settings.canvas.pageColor")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => store.setBackground(undefined)}
              aria-pressed={pinned === undefined}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1 text-xs ${
                pinned === undefined
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-line text-fg hover:bg-surface-2"
              }`}
            >
              <span
                className="h-4 w-4 rounded-full border border-line"
                style={{ backgroundColor: resolvePageColor(undefined, dark) }}
              />
              {t("settings.canvas.pageFollowTheme")}
            </button>
            {swatches.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => store.setBackground(swatch)}
                aria-pressed={swatch === pinned}
                aria-label={swatch}
                title={swatch}
                className={`h-7 w-7 cursor-pointer rounded-full border-2 ${
                  swatch === pinned ? "border-accent" : "border-line"
                }`}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
          <p className="text-xs text-muted">
            {t("settings.canvas.pageColorHint")}
          </p>
        </div>
      </Section>

      <Section title={t("settings.canvas.gridTitle")}>
        <ToggleRow
          label={t("settings.canvas.showGrid")}
          hint={t("settings.canvas.showGridHint")}
          checked={settings.showGrid}
          onChange={(next) => update("showGrid", next)}
        />
      </Section>
    </div>
  );
}

// --- Storage ---------------------------------------------------------------

// Where the document lives, whether the cloud copy is encrypted, and the two
// ways out (JSON document, PNG page). Everything here applies *live* — it is
// device state, not a draft setting, so there is nothing to Save.
export function StorageTab({
  store,
  sync,
  darkCanvas,
}: {
  store: PaintStore;
  sync: SyncEngine;
  /** Whether the page is a dark sheet — the PNG export bakes it in. */
  darkCanvas: boolean;
}) {
  const t = useT();
  const [gateOpen, setGateOpen] = useState(false);
  // The picker shows the *target* backend; an unconnected backend shows its
  // Connect affordance until the OAuth flow (cloud) or directory pick (folder)
  // lands.
  const [picked, setPicked] = useState<SyncBackendId>(sync.backend);
  // While a connect flow is in flight (an OAuth redirect / consent popup, or
  // the directory picker + permission prompt) the button shows a spinner and
  // locks so the tap reads as "working" instead of dead.
  const [connecting, setConnecting] = useState(false);
  const runConnect = (fn: () => Promise<void>) => {
    setConnecting(true);
    void fn().finally(() => setConnecting(false));
  };

  // A cloud backend only appears in the picker when its OAuth identifier is
  // baked into the build — an unconfigured backend can't be connected, so we
  // hide it rather than offer a dead option. The local folder appears only in
  // browsers that expose the File System Access API (Chromium-based).
  const backendOptions = [
    { value: "local" as const, label: t("settings.storage.backendThisDevice") },
    ...(FOLDER_BACKEND_AVAILABLE
      ? [
          {
            value: "folder" as const,
            label: t("settings.storage.backendFolder"),
          },
        ]
      : []),
    ...(DROPBOX_APP_KEY
      ? [
          {
            value: "dropbox" as const,
            label: t("settings.storage.backendDropbox"),
          },
        ]
      : []),
    ...(GOOGLE_CLIENT_ID
      ? [
          {
            value: "gdrive" as const,
            label: t("settings.storage.backendGdrive"),
          },
        ]
      : []),
  ];

  const pickedFolder = picked === "folder";
  const pickedCloud =
    picked === "dropbox" || picked === "gdrive" ? picked : null;
  // Unconfigured backends are hidden above, so this only fires for a backend
  // persisted by an earlier build that had the key and this one doesn't — still
  // worth explaining rather than leaving the picker silently stuck.
  const missingKey =
    (pickedCloud === "dropbox" && !DROPBOX_APP_KEY) ||
    (pickedCloud === "gdrive" && !GOOGLE_CLIENT_ID);

  const exportJson = () => {
    downloadText("paint.json", serializeDoc(store.data), MIME_JSON);
    log.info("export: wrote paint.json");
  };
  const exportPng = () => {
    const drawing = store.activeDrawing;
    if (!drawing) return;
    const pageColor = resolvePageColor(drawing.background, darkCanvas);
    void drawingToPng(drawing, {
      pageColor,
      defaultInk: defaultInk(darkCanvas),
    }).then((blob) => {
      downloadBlob(exportFileName(drawing, "png"), blob);
      log.info("export: wrote the page as PNG");
    });
  };

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.storage.intro")}</p>

      <Section title={t("settings.storage.backendTitle")}>
        <SegmentedControl<SyncBackendId>
          value={picked}
          onChange={(next) => {
            setPicked(next);
            if (next === "local" && sync.backend !== "local") sync.disconnect();
          }}
          options={backendOptions}
          ariaLabel={t("settings.storage.backendTitle")}
        />

        {pickedFolder && (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted">
              {t("settings.storage.folderHint")}
            </p>
            {sync.backend === "folder" && sync.connected ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-success">
                  {t("settings.storage.folderConnected")}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    sync.disconnect();
                    setPicked("local");
                  }}
                >
                  {t("settings.storage.disconnect")}
                </Button>
              </div>
            ) : sync.backend === "folder" && sync.folderReconnectNeeded ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-warning">
                  {t("settings.storage.folderReconnectNeeded")}
                </span>
                <Button
                  variant="primary"
                  disabled={connecting}
                  onClick={() => runConnect(() => sync.reconnectFolder())}
                >
                  <span className="flex items-center gap-1.5">
                    {connecting && (
                      <SpinnerIcon className="h-4 w-4 animate-spin" />
                    )}
                    {t("settings.storage.folderReconnect")}
                  </span>
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                className="self-start"
                disabled={connecting}
                onClick={() => runConnect(() => sync.connectFolder())}
              >
                <span className="flex items-center gap-1.5">
                  {connecting && (
                    <SpinnerIcon className="h-4 w-4 animate-spin" />
                  )}
                  {t("settings.storage.folderChoose")}
                </span>
              </Button>
            )}
          </div>
        )}

        {pickedCloud && missingKey && (
          <p className="text-xs text-warning">
            {pickedCloud === "dropbox"
              ? t("settings.storage.missingKeyDropbox")
              : t("settings.storage.missingKeyGdrive")}
          </p>
        )}

        {pickedCloud && !missingKey && (
          <div className="flex flex-wrap items-center gap-2">
            {sync.backend === pickedCloud && sync.connected ? (
              <>
                <span className="text-sm text-success">
                  {t("settings.storage.connected", {
                    name: PROVIDER_NAMES[pickedCloud],
                  })}
                </span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    sync.disconnect();
                    setPicked("local");
                  }}
                >
                  {t("settings.storage.disconnect")}
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                disabled={connecting}
                onClick={() =>
                  runConnect(() =>
                    pickedCloud === "dropbox"
                      ? sync.connectDropbox()
                      : sync.connectGdrive(),
                  )
                }
              >
                <span className="flex items-center gap-1.5">
                  {connecting && (
                    <SpinnerIcon className="h-4 w-4 animate-spin" />
                  )}
                  {t("settings.storage.connect", {
                    name: PROVIDER_NAMES[pickedCloud],
                  })}
                </span>
              </Button>
            )}
          </div>
        )}
      </Section>

      {sync.backend !== "local" && (
        <Section title={t("settings.storage.encryptionTitle")}>
          <ToggleRow
            label={t("settings.storage.encrypt")}
            hint={t("settings.storage.encryptHint")}
            checked={sync.encrypted}
            onChange={(next) => {
              sync.setEncrypted(next);
              // Turning encryption on needs a passphrase before the next push,
              // so raise the gate straight away rather than failing the save.
              if (next) setGateOpen(true);
            }}
          />
          {(sync.locked || gateOpen) && (
            <div className="flex flex-col gap-1">
              <span className="text-sm text-fg-bright">
                {t("settings.storage.unlockTitle")}
              </span>
              <p className="text-xs text-muted">
                {t("settings.storage.unlockHint")}
              </p>
              <UnlockGate
                open
                onUnlock={async (password: string) => {
                  await sync.unlock(password);
                  setGateOpen(false);
                }}
              />
            </div>
          )}
        </Section>
      )}

      <Section title={t("settings.storage.exportTitle")}>
        <p className="text-xs text-muted">{t("settings.storage.exportHint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportJson}>
            {t("canvas.exportJson")}
          </Button>
          <Button variant="secondary" onClick={exportPng}>
            {t("canvas.exportPng")}
          </Button>
        </div>
      </Section>
    </div>
  );
}

// --- Developer -------------------------------------------------------------

export function DeveloperTab({
  settings,
  update,
}: {
  settings: AppSettings;
  update: Update;
}) {
  const t = useT();
  const standalone = useStandaloneMobile();
  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.developer.intro")}</p>

      <Section title={t("settings.developer.loggingTitle")}>
        <ToggleRow
          label={t("settings.developer.captureLogs")}
          hint={t("settings.developer.captureLogsHint")}
          checked={settings.captureLogs}
          onChange={(next) => update("captureLogs", next)}
        />
      </Section>

      <Section title={t("settings.developer.pluginsTitle")}>
        <p className="text-sm text-fg">
          {t("settings.developer.pluginsRegistered", {
            n: String(allPlugins().length),
          })}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {allPlugins().map((plugin) => (
            <li
              key={plugin.id}
              className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-muted"
            >
              {plugin.id}
              {plugin.core ? "*" : ""}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("settings.developer.buildTitle")}>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted">{t("settings.developer.buildLabel")}</dt>
          <dd className="font-mono text-fg">{__BUILD_LABEL__}</dd>
          <dt className="text-muted">{t("settings.developer.commitLabel")}</dt>
          <dd className="font-mono text-fg">{__BUILD_COMMIT__}</dd>
          <dt className="text-muted">{t("settings.developer.modeLabel")}</dt>
          <dd className="font-mono text-fg">{__BUILD_NUMBER__}</dd>
          <dt className="text-muted">{t("settings.developer.displayLabel")}</dt>
          <dd className="font-mono text-fg">
            {standalone
              ? t("settings.developer.installedPwa")
              : t("settings.developer.browserTab")}
          </dd>
        </dl>
      </Section>
    </div>
  );
}

// --- Logs ------------------------------------------------------------------

export function LogsTab() {
  const t = useT();
  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.logs.intro")}</p>
      <Section title={t("settings.logs.logsTitle")}>
        <LogViewer store={logStore} />
      </Section>
    </div>
  );
}
