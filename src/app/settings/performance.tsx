// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Section, ToggleRow } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { AppSettings } from "../useAppSettings.ts";

// Settings → Performance: what the app is allowed to spend to look smoother.
//
// The page exists because "faster" is not one answer here — it is a *trade*,
// and the two sides of it land on different devices. Everything else in
// Settings is a preference (a colour, an order, a format); a switch on this page
// buys smoothness with memory or with work done in the background, and the same
// switch that makes a desktop feel immediate can make a phone hitch. So the
// trades are gathered in one place, named as trades, and left off out of the
// box — the app is quick on every device it ships to, and this page is where
// somebody who knows their machine has room to spare says so.
//
// It is deliberately *not* where the two simulation-detail sliders live. Those
// are the same kind of trade, but they change what a mark looks like as well as
// what it costs, and a trade you have to see to judge belongs on the brush's own
// panel with the mark in front of you (see `plugins/washOptions.ts`).
export function PerformanceTab({
  settings,
  update,
}: {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
}) {
  const t = useT();
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        {t("settings.performance.intro")}
      </p>

      <Section title={t("settings.performance.renderingTitle")}>
        <ToggleRow
          label={t("settings.performance.fullRender")}
          hint={t("settings.performance.fullRenderHint")}
          checked={settings.fullRender}
          onChange={(next) => update("fullRender", next)}
        />
      </Section>
    </div>
  );
}
