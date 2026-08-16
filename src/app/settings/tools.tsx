// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Section } from "@niclaslindstedt/oss-framework/components";
import type { ThemeAppearance } from "@niclaslindstedt/oss-framework/theme";

import { isDarkAppearance, resolvePageColor } from "../canvas.ts";
import { useT } from "../i18n/index.ts";
import { orderedEntries } from "../plugins/registry.ts";
import type { AppSettings } from "../useAppSettings.ts";
import { isCore, ToolRow } from "./toolRow.tsx";
import { WashEngineSection } from "./wash.tsx";

// Settings → Tools: the plugin switchboard, and the whole user-facing plugin
// story. When externally-loaded plugins land they list here beside the
// built-ins, through the same rows.
//
// **The list is the toolbar.** One list, in the order the buttons actually sit
// in, with the up / down buttons that put them in another one — so this page is
// not a description of the toolbar, it is the toolbar with its lid off. That is
// why the always-on tools are in it too rather than penned in a section of their
// own: they have a place in the row like everything else, and a page that let
// you reorder eight of eleven buttons would be a puzzle.
//
// The rows themselves are `toolRow.tsx`'s, because a *canvas type* holds a list
// of exactly the same shape — one page's kit rather than the app's — and the two
// lists must not read as two different kinds of thing (see `canvasTypes.ts`).
// This page is the app-wide one: the toolbar every drawing gets unless the page
// it was made on brought its own.

export function ToolsTab({
  settings,
  setPluginEnabled,
  moveTool,
  update,
  appearance,
}: {
  settings: AppSettings;
  setPluginEnabled: (id: string, enabled: boolean) => void;
  /** Move a row within the order. It is handed the whole order it is a
   *  permutation of, because a list of ids means nothing without the list of
   *  entries it reorders — see `moveTool` in `useAppSettings.ts`. */
  moveTool: (order: readonly string[], from: number, to: number) => void;
  /** Applied live, like the switchboard: this page is device state, not a
   *  staged draft (see `SettingsModal`). */
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  appearance: ThemeAppearance;
}) {
  const t = useT();
  const entries = orderedEntries(settings.toolOrder);
  const order = entries.map((entry) => entry.id);
  // The page the watercolour samples below are painted on, so they are *this*
  // sheet rather than a stranger's — the same call the surface swatches make.
  const dark = isDarkAppearance(appearance);

  return (
    <div>
      <p className="mb-3 text-xs text-muted">{t("settings.tools.intro")}</p>

      <Section title={t("settings.tools.optionalTitle")}>
        <p className="text-xs text-muted">{t("settings.tools.optionalHint")}</p>
        <ul className="flex flex-col gap-1">
          {entries.map((entry, index) => (
            <li key={entry.id}>
              <ToolRow
                entry={entry}
                checked={
                  isCore(entry) || settings.enabledPlugins.includes(entry.id)
                }
                locked={isCore(entry)}
                onChange={(next) => setPluginEnabled(entry.id, next)}
                onMoveUp={
                  index > 0
                    ? () => moveTool(order, index, index - 1)
                    : undefined
                }
                onMoveDown={
                  index < entries.length - 1
                    ? () => moveTool(order, index, index + 1)
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      </Section>

      {/* Which watercolour engine paints a wash. It is here rather than on the
          Canvas tab because it is a property of the brush and not of the
          page. */}
      <WashEngineSection
        engine={settings.washEngine}
        onChange={(next) => update("washEngine", next)}
        pageColor={resolvePageColor(undefined, dark)}
        dark={dark}
      />
    </div>
  );
}
