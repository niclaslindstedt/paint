// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { ToolPresetOption } from "../plugins/presets.ts";
import type { ToolOptionValue } from "../plugins/options.ts";
import type {
  PaintPlugin,
  ToolDial,
  ToolOption,
  ToolSwatch,
} from "../plugins/types.ts";
import type { PresetSettings } from "../presets.ts";
import { PressPreview } from "./PressPreview.tsx";
import { ShippedPresets } from "./PresetBar.tsx";
import { ToolDials } from "./ToolDials.tsx";
import { ToolOptions } from "./ToolOptions.tsx";
import { ToolSwatches } from "./ToolSwatches.tsx";

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
//
// **And a tool that mixes its own inks puts them at the very top, under a
// press.** The gradient is the case: while it is in hand the toolbar's ink
// button is crossed out, because the ramp is poured from the colours on this
// panel and from nothing else — so this panel is the only place those colours
// are shown, and showing them as swatches alone would say what they are without
// saying what they make. The press over them is the ordinary one every size
// button draws (see `press.ts`): the mark this tool leaves, as it is set now.

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
  /** The app-wide settings this tool declares, and where they sit — the same
   *  section the size panel puts under its dials (see `plugins/options.ts`).
   *  Empty for every widthless tool today, and then there is no such section. */
  options: readonly ToolOption[];
  optionValues: Readonly<Record<string, ToolOptionValue>>;
  onOptionChange: (id: string, value: ToolOptionValue) => void;
  /** The inks this tool carries of its own, in the order it declared them.
   *  Empty for every tool but the gradient today, and then there is no swatch
   *  row and no preview. */
  swatches: readonly ToolSwatch[];
  /** Where those swatches sit, resolved. */
  colors: Readonly<Record<string, string>>;
  onColorChange: (id: string, color: string | null) => void;
  /** The colours the user has mixed, offered beside the built-in palette. */
  customColors: readonly string[];
  onResetDials: () => void;
  tuned: boolean;
};

/** The width the press preview is drawn at. A widthless tool has none to show,
 *  but the preview still has to be *some* size on the page — this is what the
 *  bucket's blot is scaled from, and the tile fits it either way. */
const PREVIEW_SIZE = 24;

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
  options,
  optionValues,
  onOptionChange,
  swatches,
  colors,
  onColorChange,
  customColors,
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
        {swatches.length > 0 && (
          <>
            <div className="flex justify-center">
              <PressPreview
                plugin={plugin}
                size={PREVIEW_SIZE}
                of={PREVIEW_SIZE}
                color={color}
                background={background}
                dials={values}
                colors={colors}
                box={64}
              />
            </div>
            <ToolSwatches
              plugin={plugin}
              swatches={swatches}
              values={colors}
              onChange={onColorChange}
              customColors={customColors}
            />
            <span aria-hidden="true" className="block h-px bg-line" />
          </>
        )}

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

        {/* …and the tool's app-wide settings under them, exactly as in the size
            panel: same section, same rows, only the width taken away. */}
        {options.length > 0 && (
          <div className="border-t border-line pt-2">
            <ToolOptions
              title={t("options.title")}
              options={options}
              values={optionValues}
              onChange={onOptionChange}
              color={color}
              background={background}
            />
          </div>
        )}
      </div>
    </FloatingPanel>
  );
}
