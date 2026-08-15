// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect } from "react";

import { HeaderIconButton } from "./HeaderIconButton.tsx";
import { SaveIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { fieldHasKeyboard } from "./keys.ts";
import type { InkContext } from "./render.ts";

// The header's disk button, and ⌘/Ctrl+S behind it.
//
// It files the drawing's *rendered layers* out to the backend — the half of a
// save that costs megabytes, and therefore the half worth letting the user pick
// the moment of. The strokes are already safe: they are written to this device
// the instant you draw them, and pushed to the backend on their own (see
// `useSyncEngine.ts`). So this button never guards against losing work; it
// decides when the picture is worth uploading.
//
// It takes the ink rather than reading it, because what a layer *looks like*
// depends on the canvas theme — a mark that never chose a colour follows the
// page — and only the screen knows which theme is showing.

export type LayerSaveControl = {
  dirty: boolean;
  status: "idle" | "saving" | "saved" | "error";
  save: (ink: InkContext) => void;
};

type Props = {
  layerSave: LayerSaveControl;
  /** The ink the layers would be rendered with, resolved fresh on every render
   *  by the screen — so a light/dark flip between presses can't file the
   *  previous theme's pixels. */
  ink: InkContext;
};

export function SaveButton({ layerSave, ink }: Props) {
  const t = useT();
  const saving = layerSave.status === "saving";
  const idle = saving || !layerSave.dirty;

  // The listener is keyed on the ink's two *values* rather than the object the
  // screen rebuilds every render — otherwise every repaint would tear the
  // listener down and put an identical one back.
  const { pageColor, defaultInk } = ink;
  const save = layerSave.save;

  // The browser's own ⌘S over a canvas app offers to save the *page* — an HTML
  // file of no use to anyone — so the default is prevented whether or not we go
  // on to save anything.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
      e.preventDefault();
      if (fieldHasKeyboard(e.target) || idle) return;
      save({ pageColor, defaultInk });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save, pageColor, defaultInk, idle]);

  return (
    <HeaderIconButton
      label={
        saving
          ? t("layerSave.saving")
          : layerSave.dirty
            ? t("layerSave.save")
            : t("layerSave.saved")
      }
      disabled={idle}
      onClick={() => layerSave.save(ink)}
    >
      <SaveIcon className="h-[18px] w-[18px]" />
    </HeaderIconButton>
  );
}
