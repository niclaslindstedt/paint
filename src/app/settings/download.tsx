// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import {
  Section,
  SegmentedControl,
  ToggleRow,
} from "@niclaslindstedt/oss-framework/components";

import {
  DOWNLOAD_FORMATS,
  type DownloadFormat,
  type ExportScope,
} from "../export.ts";
import { FileFormatIcon } from "../icons.tsx";
import { useT, type TKey } from "../i18n/index.ts";
import type { AppSettings } from "../useAppSettings.ts";

// Settings → Download: what the header's download menu offers, and what comes
// out of it.
//
// Three questions, and each of them is a real preference rather than a default
// worth guessing at:
//
//   - which file types are on the menu. Someone who never wants a JPG shouldn't
//     have to read past one every time they export.
//   - the whole page, or just the part with marks on it. A 3200×2000 sheet with
//     a diagram in one corner is mostly empty space in a chat window.
//   - the page colour, or transparency. A sketch dropped onto a slide should be
//     able to bring its own background — or not.
//
// Staged in the settings draft like the other preference tabs: nothing here
// applies until Save.

type Update = <K extends keyof AppSettings>(
  key: K,
  value: AppSettings[K],
) => void;

/** The catalog strings each format's row is written from. */
const FORMAT_KEYS: Record<DownloadFormat, { name: TKey; description: TKey }> = {
  png: {
    name: "settings.download.formatPng",
    description: "settings.download.formatPngHint",
  },
  jpg: {
    name: "settings.download.formatJpg",
    description: "settings.download.formatJpgHint",
  },
  svg: {
    name: "settings.download.formatSvg",
    description: "settings.download.formatSvgHint",
  },
};

export function DownloadTab({
  settings,
  update,
}: {
  settings: AppSettings;
  update: Update;
}) {
  const t = useT();
  const scopeOptions = [
    { value: "page" as const, label: t("settings.download.scopePage") },
    { value: "marks" as const, label: t("settings.download.scopeMarks") },
  ];

  /** Switch one file type on or off, keeping the menu in its canonical order
   *  rather than the order the switches were flipped in. */
  const setFormat = (format: DownloadFormat, enabled: boolean) =>
    update(
      "downloadFormats",
      DOWNLOAD_FORMATS.filter((id) =>
        id === format ? enabled : settings.downloadFormats.includes(id),
      ),
    );

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.download.intro")}</p>

      <Section title={t("settings.download.typesTitle")}>
        <p className="text-xs text-muted">{t("settings.download.typesHint")}</p>
        {DOWNLOAD_FORMATS.map((format) => (
          // The glyph sits beside the switch rather than inside its label, so
          // the row reads as the same row the download menu shows.
          <div key={format} className="flex items-start gap-2">
            <FileFormatIcon
              className="mt-2 h-5 w-5 shrink-0 text-accent"
              label={format.toUpperCase()}
            />
            <div className="min-w-0 flex-1">
              <ToggleRow
                label={t(FORMAT_KEYS[format].name)}
                hint={t(FORMAT_KEYS[format].description)}
                checked={settings.downloadFormats.includes(format)}
                onChange={(next) => setFormat(format, next)}
              />
            </div>
          </div>
        ))}
        {settings.downloadFormats.length === 0 && (
          <p className="text-xs text-warning">
            {t("settings.download.noTypes")}
          </p>
        )}
      </Section>

      <Section title={t("settings.download.areaTitle")}>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-bright">
            {t("settings.download.areaLabel")}
          </span>
          <SegmentedControl<ExportScope>
            value={settings.downloadScope}
            options={scopeOptions}
            onChange={(next) => update("downloadScope", next)}
            ariaLabel={t("settings.download.areaLabel")}
          />
          <p className="text-xs text-muted">
            {t("settings.download.areaHint")}
          </p>
        </div>
      </Section>

      <Section title={t("settings.download.backgroundTitle")}>
        <ToggleRow
          label={t("settings.download.transparent")}
          hint={t("settings.download.transparentHint")}
          checked={settings.downloadTransparent}
          onChange={(next) => update("downloadTransparent", next)}
        />
      </Section>
    </div>
  );
}
