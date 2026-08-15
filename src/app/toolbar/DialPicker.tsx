// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { FloatingPanel } from "@niclaslindstedt/oss-framework/components";

import { useT } from "../i18n/index.ts";
import type { PaintPlugin, ToolDial, ToolSwatch } from "../plugins/types.ts";
import { PressPreview } from "./PressPreview.tsx";
import { ToolDials } from "./ToolDials.tsx";
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
// **A tool that mixes its own inks puts them at the top, under a press.** The
// gradient is the case: while it is in hand the toolbar's ink button is dimmed,
// because the ramp is poured from the colours on this panel and from nothing
// else — so this panel is the only place those colours are shown, and showing
// them as swatches alone would say what they are without saying what they make.
// The press above them is the ordinary one every size button draws (see
// `press.ts`): the mark this tool leaves, as it is currently set. It is offered
// only to the tools that carry their own inks, because for everything else the
// ink button is already the read-out.

type Props = {
  open: boolean;
  onClose: () => void;
  anchor: React.RefObject<HTMLButtonElement | null>;
  /** The tool whose settings these are — it names the section. */
  plugin: PaintPlugin | undefined;
  dials: readonly ToolDial[];
  values: Readonly<Record<string, number>>;
  onDialChange: (id: string, value: number | null) => void;
  /** The inks this tool carries of its own, in the order it declared them.
   *  Empty for every tool but the gradient today, and then there is no swatch
   *  row and no preview. */
  swatches: readonly ToolSwatch[];
  /** Where those swatches sit, resolved. */
  colors: Readonly<Record<string, string>>;
  onColorChange: (id: string, color: string | null) => void;
  /** The colours the user has mixed, offered beside the built-in palette. */
  customColors: readonly string[];
  /** The page the preview is painted on — a ramp ending in white has to read on
   *  a white sheet the way it will on the page. */
  background: string;
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
  dials,
  values,
  onDialChange,
  swatches,
  colors,
  onColorChange,
  customColors,
  background,
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
                color={background}
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

        <ToolDials
          title={plugin ? t(plugin.nameKey) : t("dials.advanced")}
          dials={dials}
          values={values}
          onChange={onDialChange}
          onReset={onResetDials}
          tuned={tuned}
        />
      </div>
    </FloatingPanel>
  );
}
