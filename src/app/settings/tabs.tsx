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
import {
  useStandaloneMobile,
  type PwaUpdate,
  type PwaUpdateCheckResult,
} from "@niclaslindstedt/oss-framework/pwa";
import {
  downloadBlob,
  downloadText,
  MIME_JSON,
} from "@niclaslindstedt/oss-framework/files";

import { defaultInk, isDarkColor, resolvePageColor } from "../canvas.ts";
import { drawingToPng, exportFileName } from "../export.ts";
import { cachedImage } from "../images.ts";
import { visibleStrokes } from "../layers.ts";
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
import type { Drawing } from "../types.ts";
import type { PaintStore } from "../usePaintStore.ts";
import {
  DROPBOX_APP_KEY,
  FOLDER_BACKEND_AVAILABLE,
  GOOGLE_CLIENT_ID,
  PROVIDER_NAMES,
  type SyncBackendId,
  type SyncEngine,
} from "../useSyncEngine.ts";
import { DefaultsSection } from "./defaults.tsx";
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
  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.general.intro")}</p>

      {/* First, because it is the only section here about the drawing rather
          than about the furniture: what the app hands you when there is nothing
          in front of you yet. */}
      <DefaultsSection settings={settings} update={update} />

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

      {/* The two things that are drawn *around* your marks rather than being
          part of the page. They sit here rather than with the page's own
          answers (size, colour, sheet) because neither is one: both are ways of
          looking at any drawing, and neither ever exports. */}
      <Section title={t("settings.general.gridTitle")}>
        <ToggleRow
          label={t("settings.general.showGrid")}
          hint={t("settings.general.showGridHint")}
          checked={settings.showGrid}
          onChange={(next) => update("showGrid", next)}
        />
        <ToggleRow
          label={t("settings.general.showPixelGrid")}
          hint={t("settings.general.showPixelGridHint")}
          checked={settings.showPixelGrid}
          onChange={(next) => update("showPixelGrid", next)}
        />
      </Section>

      <Section title={t("settings.general.toolNameTitle")}>
        <ToggleRow
          label={t("settings.general.showToolName")}
          hint={t("settings.general.showToolNameHint")}
          checked={settings.showToolName}
          onChange={(next) => update("showToolName", next)}
        />
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
      // Inked against the page in the file, not against the app around it — the
      // exported PNG has no theme (see `defaultInk`).
      defaultInk: defaultInk(isDarkColor(pageColor)),
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

/** Forcing the update check, as a button you press and a line that answers.
 *
 *  The framework's `CheckForUpdatesItem` is a *menu row* — a glyph, a label, and
 *  everything left-aligned under the row above it — which is what it was
 *  built for and exactly wrong on a settings tab: indented text that happens to
 *  be clickable reads as a caption, and the one thing this control has to look
 *  like is a button. So it is one, centred in its section, with the outcome
 *  under it rather than replacing the label — a button whose text changes to
 *  "Up to date" has thrown away the thing you press to ask again. */
function UpdateCheck({ pwa }: { pwa: PwaUpdate }) {
  const t = useT();
  const [result, setResult] = useState<PwaUpdateCheckResult | null>(null);
  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="secondary"
        disabled={pwa.checking}
        onClick={() => {
          setResult(null);
          void pwa.checkForUpdate().then(setResult);
        }}
      >
        {pwa.checking
          ? t("settings.developer.checking")
          : t("settings.developer.checkUpdate")}
      </Button>
      {/* What the last look found. `unavailable` is a real answer — a dev build
          registers no worker at all — and saying so is better than a button
          that appears to do nothing. */}
      {!pwa.checking && (result || pwa.needRefresh) && (
        <p className="text-xs text-muted">
          {t(
            pwa.needRefresh || result === "update-found"
              ? "settings.developer.updateAvailable"
              : result === "unavailable"
                ? "settings.developer.updatesUnavailable"
                : "settings.developer.upToDate",
          )}
        </p>
      )}
    </div>
  );
}

/** What a picture in the open drawing is *made of*, against what it is *drawn
 *  at* — the one fact that decides whether its pixels can land on the page's
 *  own lattice, and the one nobody could read off the screen.
 *
 *  A bitmap stored smaller than it is placed is magnified before the view ever
 *  gets to it: its pixels come out `placed ÷ stored` document pixels wide, so
 *  its colour changes fall *inside* the pixel grid's cells rather than on their
 *  edges (see `pixelGrid.ts`). That reads as the grid being wrong and it is
 *  not, which is exactly why this readout exists — it is a number instead of an
 *  argument. Anything but `1.000` is the picture, not the grid.
 *
 *  `bitmapOf` is how a picture's real size is looked up — the decode cache in
 *  the app, a stub in a test, which is the whole reason it is a parameter. */
export function pictureFacts(
  drawing: Drawing | null,
  bitmapOf: (
    src: string,
  ) => { naturalWidth: number; naturalHeight: number } | null = cachedImage,
): {
  name: string;
  stored: string;
  placed: string;
  ratio: string;
  exact: boolean;
  kind: string;
}[] {
  if (!drawing) return [];
  const out = [];
  let n = 0;
  for (const stroke of visibleStrokes(drawing)) {
    const shape = stroke.shape;
    if (shape.kind !== "image") continue;
    n += 1;
    const placedWidth = Math.abs(shape.to.x - shape.from.x);
    const placedHeight = Math.abs(shape.to.y - shape.from.y);
    const bitmap = shape.src ? bitmapOf(shape.src) : null;
    const storedWidth = bitmap?.naturalWidth ?? 0;
    const storedHeight = bitmap?.naturalHeight ?? 0;
    // The encoding, straight off the data URL's own header — which is what
    // answers "did the phone hand us a re-encoded JPEG?" without guessing.
    const header = /^data:([^;,]+)/.exec(shape.src ?? "");
    const ratio = storedWidth > 0 ? placedWidth / storedWidth : 0;
    out.push({
      name: `#${String(n)}`,
      stored: storedWidth
        ? `${String(storedWidth)}×${String(storedHeight)}`
        : "…",
      placed: `${String(Math.round(placedWidth))}×${String(Math.round(placedHeight))}`,
      ratio: storedWidth ? ratio.toFixed(3) : "…",
      exact: storedWidth > 0 && Math.abs(ratio - 1) < 0.001,
      kind: header?.[1]?.replace("image/", "") ?? "?",
    });
  }
  return out;
}

export function DeveloperTab({
  settings,
  update,
  pwa,
  drawing,
}: {
  settings: AppSettings;
  update: Update;
  /** The drawing that is open behind the dialog, for the picture readout. */
  drawing: Drawing | null;
  /** The live PWA update lifecycle, threaded down from `App` rather than
   *  started again here: `usePwaUpdate` owns a service-worker registration, and
   *  a second one in a dialog would be a second machine arguing with the first
   *  about which build is waiting. */
  pwa: PwaUpdate;
}) {
  const t = useT();
  const standalone = useStandaloneMobile();
  const pictures = pictureFacts(drawing);
  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.developer.intro")}</p>

      {/* Forcing the update check by hand. It used to sit in the sidebar
          footer, which put a button in everyone's way for a job the service
          worker already does on its own — it finds a new build and raises the
          toast without being asked. What is left is the case the row was
          actually useful for: standing in front of a deploy wanting to know
          whether this tab has seen it yet. That is a developer's question, so
          it is on the developer's tab. */}
      <Section title={t("settings.developer.updatesTitle")}>
        <UpdateCheck pwa={pwa} />
      </Section>

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
        {/* `selectable`: plugin ids are diagnostics, and the point of showing
            them is that they end up in a bug report. Same for the build stamp
            below (the app selects no text by default — see `styles.css`). */}
        <ul className="selectable flex flex-wrap gap-1.5">
          {allPlugins().map((plugin) => (
            <li
              key={plugin.id}
              className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-muted"
            >
              {/* `*` marks an always-on tool; a plugin with no button at all
                  (the dropped image's painter) is shown in brackets. */}
              {plugin.hidden ? `(${plugin.id})` : plugin.id}
              {plugin.core ? "*" : ""}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("settings.developer.picturesTitle")}>
        {pictures.length === 0 ? (
          <p className="text-sm text-muted">
            {t("settings.developer.picturesNone")}
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted">
              {t("settings.developer.picturesHint")}
            </p>
            <ul className="selectable flex flex-col gap-1 font-mono text-xs">
              {pictures.map((picture) => (
                <li
                  key={picture.name}
                  className={picture.exact ? "text-muted" : "text-fg-bright"}
                >
                  {picture.name} {picture.stored} {picture.kind} →{" "}
                  {picture.placed} · {picture.ratio}
                  {picture.exact ? "" : " ⚠"}
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={t("settings.developer.buildTitle")}>
        <dl className="selectable grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
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
        {/* `selectable`: a log line exists to be copied into a bug report, so
            it opts back into text selection (see `styles.css`). */}
        <div className="selectable">
          <LogViewer store={logStore} />
        </div>
      </Section>
    </div>
  );
}
