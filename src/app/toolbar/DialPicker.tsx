// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { ToolPresetOption } from "../plugins/presets.ts";
import type { PaintPlugin, ToolDial } from "../plugins/types.ts";
import type { PresetSettings } from "../presets.ts";
import { ShippedPresets } from "./PresetBar.tsx";
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
//
// Above them sits the same row of shipped presets the size panel opens with
// (see `PresetBar`), for the same reason and with the width simply taken away:
// a flat fill, one with a soft edge and a pale wash are three different tools
// to anybody using them, and the bucket having no nib is no reason for it to be
// the one tool you have to build by hand.

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  /** The tool whose settings these are — it names the section, and it paints
   *  the presets' previews. */
  plugin: PaintPlugin | undefined;
  /** The presets it ships with, dials resolved (see `plugins/presets.ts`). */
  builtinPresets: readonly ToolPresetOption[];
  onApplyPreset: (preset: PresetSettings) => void;
  /** The ink and the page those previews are painted in. */
  color: string;
  background: string;
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
  builtinPresets,
  onApplyPreset,
  color,
  background,
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
      <div className="flex flex-col gap-2">
        <ShippedPresets
          plugin={plugin}
          presets={builtinPresets}
          // A tool with no width is matched on its dials alone, so the number
          // here reaches nothing (see `presetMatches`).
          size={0}
          dials={values}
          color={color}
          background={background}
          filled={false}
          onApply={onApplyPreset}
        />
        <div
          className={
            builtinPresets.length > 0 ? "border-t border-line pt-2" : ""
          }
        >
          <ToolDials
            title={plugin ? t(plugin.nameKey) : t("dials.advanced")}
            dials={dials}
            values={values}
            onChange={onDialChange}
            onReset={onResetDials}
            tuned={tuned}
          />
        </div>
      </div>
    </FloatingPanel>
  );
}
