// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useRef, useState } from "react";

import {
  CopyIcon,
  DownloadIcon,
  FloatingPanel,
  type FloatingPlacement,
} from "@niclaslindstedt/oss-framework/components";
import { downloadBlob } from "@niclaslindstedt/oss-framework/files";

import {
  copyDrawingToClipboard,
  drawingToBlob,
  exportFileName,
  type DownloadFormat,
  type ExportOptions,
} from "./export.ts";
import { HeaderIconButton } from "./HeaderIconButton.tsx";
import { FileFormatIcon } from "./icons.tsx";
import { useT } from "./i18n/index.ts";
import { log } from "./log.ts";
import * as output from "../output.ts";
import type { Drawing } from "./types.ts";

// The header's download button, and the menu behind it.
//
// One button used to mean one file type. It now opens a short menu — a row per
// file type the user has left switched on, plus "copy to clipboard" — because
// which type you want depends entirely on where the sketch is going: a PNG into
// a chat, an SVG into a slide that will be resized, a JPG when someone's upload
// form insists. Guessing on the user's behalf was the wrong call, and a picker
// buried in Settings would be worse: the choice belongs at the moment of
// export.
//
// Settings → Download owns *which* rows are here and what they produce (the
// whole page or a crop of the marks, on the page colour or on transparency);
// this component owns the menu and the file that comes out of it.

// The menu hangs under the header button and is right-aligned with it — the
// button sits at the right end of the header, so a left-anchored panel would
// run off the screen on a phone.
const MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 208 },
  anchor: "right",
  coordinateSpace: "viewport",
};

type Props = {
  drawing: Drawing;
  /** How the export paints: the page colour, the default ink, the scope, and
   *  whether the sheet is left transparent. Assembled by the screen from the
   *  canvas theme and Settings → Download. */
  options: ExportOptions;
  /** The file types to offer, in menu order. */
  formats: readonly DownloadFormat[];
};

export function DownloadMenu({ drawing, options, formats }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  const download = async (format: DownloadFormat) => {
    setOpen(false);
    const name = exportFileName(drawing, format);
    try {
      downloadBlob(name, await drawingToBlob(drawing, format, options));
      log.info(`export: wrote ${name}`);
    } catch (err) {
      output.error(
        `Couldn't export the ${format.toUpperCase()} — ${message(err)}`,
      );
    }
  };

  const copy = () => {
    setOpen(false);
    // Not awaited before the clipboard write is *started*: some browsers only
    // let a page write to the clipboard inside the gesture that asked for it,
    // so the render is handed over as a promise rather than awaited first (see
    // `copyDrawingToClipboard`).
    copyDrawingToClipboard(drawing, options).then(
      () => log.info("export: copied the page to the clipboard"),
      (err: unknown) =>
        output.error(`Couldn't copy the drawing — ${message(err)}`),
    );
  };

  return (
    <>
      <HeaderIconButton
        label={t("canvas.download")}
        buttonRef={anchor}
        expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <DownloadIcon className="h-[18px] w-[18px]" />
      </HeaderIconButton>

      <FloatingPanel
        open={open}
        onClose={() => setOpen(false)}
        triggerRef={anchor}
        placement={MENU_PLACEMENT}
        className="py-1"
      >
        <div role="menu" className="flex w-full flex-col">
          {formats.map((format) => (
            <MenuItem
              key={format}
              label={t("canvas.downloadFormat", {
                format: format.toUpperCase(),
              })}
              icon={
                <FileFormatIcon
                  className="h-5 w-5"
                  label={format.toUpperCase()}
                />
              }
              onSelect={() => void download(format)}
            />
          ))}
          {formats.length > 0 && (
            <div className="my-1 border-t border-line" aria-hidden="true" />
          )}
          {/* Always offered, whatever is switched off above: the clipboard is
              the one exit with no file to find afterwards, and it is a PNG
              because that is what every clipboard on every platform takes. */}
          <MenuItem
            label={t("canvas.copyToClipboard")}
            icon={<CopyIcon className="h-[18px] w-[18px]" />}
            onSelect={copy}
          />
        </div>
      </FloatingPanel>
    </>
  );
}

/** One row of the menu: a glyph, a label, and the action behind it. */
function MenuItem({
  label,
  icon,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-sm text-fg hover:bg-surface-2 hover:text-fg-bright"
    >
      <span className="shrink-0 text-muted">{icon}</span>
      <span className="min-w-0">{label}</span>
    </button>
  );
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
