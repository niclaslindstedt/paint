// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { PaintPlugin, ToolDial } from "../plugins/types.ts";
import { ToolDials } from "./ToolDials.tsx";

// The cog panel: what a tool with no width has to set.
//
// The paint bucket is the tool it was built for. It fills the area it traced
// and fills exactly that area whatever the nib says, so a size button for it
// was a control that moved a number no mark reads — but it is far from
// settingless: how much of the page shows through the wash, and how far its
// edge fades out, are the two things that make a bucket fill worth having. They
// used to be reachable only by opening a panel of widths that did nothing and
// unfolding a section inside it.
//
// So the toolbar puts a cog where the size button would be, and it opens the
// dials directly (see `plugins/controls.ts` for which tools get which). Same
// section, same rows, same per-tool memory as the size panel's — this is only
// the width taken away.
//
// The heading names the tool rather than saying **Advanced**: with no basic
// half above them there is nothing for these to be advanced *of*, and what a
// panel opened from an unlabelled cog most needs to say is whose settings
// these are.

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  /** The tool whose settings these are — it names the section. */
  plugin: PaintPlugin | undefined;
  dials: readonly ToolDial[];
  values: Readonly<Record<string, number>>;
  onDialChange: (id: string, value: number | null) => void;
  onResetDials: () => void;
  tuned: boolean;
};

export function DialPicker({
  open,
  onClose,
  anchor,
  plugin,
  dials,
  values,
  onDialChange,
  onResetDials,
  tuned,
}: Props) {
  const t = useT();

  return (
    <FloatingPanel
      open={open}
      onClose={onClose}
      triggerRef={anchor}
      placement={{
        width: { kind: "max", maxPx: 248 },
        anchor: "left",
        gap: 14,
        coordinateSpace: "viewport",
      }}
      className="p-2"
    >
      <ToolDials
        title={plugin ? t(plugin.nameKey) : t("dials.advanced")}
        dials={dials}
        values={values}
        onChange={onDialChange}
        onReset={onResetDials}
        tuned={tuned}
      />
    </FloatingPanel>
  );
}
