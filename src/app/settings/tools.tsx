// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Section } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import { orderedEntries } from "../plugins/registry.ts";
import type { AppSettings } from "../useAppSettings.ts";
import { isCore, ToolRow } from "./toolRow.tsx";

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
// The rows themselves are `toolRow.tsx`'s, because a *canvas preset* holds a
// list of exactly the same shape — one page's kit rather than the app's — and
// the two lists must not read as two different kinds of thing (see
// `canvasPresets.ts`).
// This page is the app-wide one: the toolbar every drawing gets unless the page
// it was made on brought its own.

export function ToolsTab({
  settings,
  setPluginEnabled,
  moveTool,
}: {
  settings: AppSettings;
  setPluginEnabled: (id: string, enabled: boolean) => void;
  /** Move a row within the order. It is handed the whole order it is a
   *  permutation of, because a list of ids means nothing without the list of
   *  entries it reorders — see `moveTool` in `useAppSettings.ts`. */
  moveTool: (order: readonly string[], from: number, to: number) => void;
}) {
  const t = useT();
  const entries = orderedEntries(settings.toolOrder);
  const order = entries.map((entry) => entry.id);

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
    </div>
  );
}
