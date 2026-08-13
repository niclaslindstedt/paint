// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import { useT } from "./i18n/index.ts";
import { enabledPlugins } from "./plugins/registry.ts";
import type { PaintPlugin } from "./plugins/types.ts";
import { ClearPicker } from "./toolbar/ClearPicker.tsx";
import { ColorPicker } from "./toolbar/ColorPicker.tsx";
import { FillPicker } from "./toolbar/FillPicker.tsx";
import { SizeDot, SizePicker } from "./toolbar/SizePicker.tsx";

// The toolbar: the enabled tools, then two buttons for everything about the
// ink.
//
// It renders whatever `enabledPlugins` hands back — the core tools plus
// whatever is switched on in Settings → Tools — so a new tool needs no change
// here. Keyboard shortcuts are wired from the plugin descriptors for the same
// reason.
//
// **Ink is two buttons, not two rows.** A fixed row of seven swatches and four
// nib buttons ate half a phone's toolbar for choices most strokes never change,
// and it grew every time the palette did. Now the colour button shows the two
// colours that matter — the ink, and what the eraser paints — split across one
// square, and the size button shows the nib as a dot the size it will actually
// be. Each opens its picker over the canvas; both close as soon as you have
// chosen. The row that is left is tools, and it can afford to be.
//
// Fill is not a row either. It lives on the shape button: press the button you
// are already holding a second time and a two-cell panel opens showing the
// shape hollow and the shape solid. Which tools offer it is the descriptor's
// `supportsFill`, so nothing here knows what a rectangle is.
//
// Clearing the page rides on that same gesture. The tool that erases carries
// `clearsPage`, and pressing its button a second time offers the two scales of
// rubbing out: by hand, or all of it. That is why there is no bin in the
// header — the header spends its width on the drawing's name instead, and the
// wipe sits under the hand already reaching for the eraser. Which tool offers
// it is the descriptor's flag; nothing here knows what an eraser is either.

type Props = {
  tool: string;
  onToolChange: (id: string) => void;
  enabled: readonly string[];
  /** The ink in use, already resolved against the page by the caller. */
  color: string;
  onColorChange: (color: string) => void;
  /** The page colour — the eraser's ink, and a swatch in its own right. */
  background: string;
  customColors: readonly string[];
  onAddColor: (color: string) => void;
  onRemoveColor: (color: string) => void;
  size: number;
  onSizeChange: (size: number) => void;
  customSizes: readonly number[];
  onAddSize: (size: number) => void;
  onRemoveSize: (size: number) => void;
  hardness: number;
  onHardnessChange: (hardness: number) => void;
  filled: boolean;
  onFilledChange: (filled: boolean) => void;
  /** Wipe every mark off the page — the action offered by the tool that
   *  advertises `clearsPage`. The screen owns the confirmation and the edit;
   *  the toolbar only asks. */
  onClearPage: () => void;
  /** Whether the page has anything to clear. */
  pageHasMarks: boolean;
};

/** Whether a tool's button does a second job once it is the one in your hand.
 *  Read off descriptor flags, so a new tool joins the gesture by declaring one
 *  rather than by being named here. */
function opensPanel(plugin: PaintPlugin): boolean {
  return Boolean(plugin.supportsFill || plugin.clearsPage);
}

export function Toolbar({
  tool,
  onToolChange,
  enabled,
  color,
  onColorChange,
  background,
  customColors,
  onAddColor,
  onRemoveColor,
  size,
  onSizeChange,
  customSizes,
  onAddSize,
  onRemoveSize,
  hardness,
  onHardnessChange,
  filled,
  onFilledChange,
  onClearPage,
  pageHasMarks,
}: Props) {
  const t = useT();
  const tools = enabledPlugins(enabled);
  const active = tools.find((p) => p.id === tool);
  // Which panel is open. One at a time, and held as a discriminated value
  // rather than three booleans so opening one can never leave another hanging
  // over the canvas. A tool's own panel names its tool: switching tools with it
  // open must not leave it anchored to a button that no longer means anything.
  const [panel, setPanel] = useState<
    { kind: "tool"; tool: string } | { kind: "color" } | { kind: "size" } | null
  >(null);
  const toolAnchor = useRef<HTMLButtonElement | null>(null);
  const colorAnchor = useRef<HTMLButtonElement | null>(null);
  const sizeAnchor = useRef<HTMLButtonElement | null>(null);

  // A tool that paints with the page colour (the eraser) or moves the view (the
  // hand) has no use for the ink; one that samples a colour has no use for the
  // nib. Both are read off descriptor flags — nothing here knows a tool by name.
  const inkIrrelevant =
    active?.usesBackground || active?.navigates || active?.picksColor;
  const nibIrrelevant = active?.navigates || active?.picksColor;

  // Single-key tool shortcuts, read straight off the plugin descriptors. Held
  // back while a text field or a dialog owns the keyboard so typing a drawing's
  // name doesn't swap the pencil for the eraser.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (target?.closest("[role='dialog']")) return;
      const match = tools.find((p) => p.shortcut === e.key.toLowerCase());
      if (!match) return;
      e.preventDefault();
      // A tool picked from the keyboard closes whatever panel was open rather
      // than leaving it hanging there.
      setPanel(null);
      onToolChange(match.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tools, onToolChange]);

  return (
    // The toolbar is the last thing above the screen edge, and the app paints
    // under the home indicator (`viewport-fit=cover`), so it carries the bottom
    // safe-area inset plus 10px — enough that the buttons stay a comfortable
    // thumb reach above the indicator instead of sitting on it.
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-3 pt-2 [padding-bottom:calc(env(safe-area-inset-bottom)+10px)]"
      role="toolbar"
      aria-label={t("canvas.toolbar")}
    >
      <div className="flex flex-wrap items-center gap-1" role="group">
        {tools.map((plugin) => {
          const Icon = plugin.icon;
          const isActive = plugin.id === tool;
          const name = t(plugin.nameKey);
          // Some buttons do two jobs: pick the tool, and — once it is the one
          // you are holding — open that tool's own panel (the shapes' fill
          // picker, the eraser's clear action). That is the "press it twice"
          // gesture, and it costs the toolbar nothing.
          const opensOwn = opensPanel(plugin) && isActive;
          return (
            <button
              key={plugin.id}
              type="button"
              ref={opensOwn ? toolAnchor : undefined}
              onClick={() => {
                setPanel(opensOwn ? { kind: "tool", tool: plugin.id } : null);
                if (!isActive) onToolChange(plugin.id);
              }}
              aria-pressed={isActive}
              aria-haspopup={opensOwn ? "menu" : undefined}
              aria-expanded={
                opensOwn
                  ? panel?.kind === "tool" && panel.tool === plugin.id
                  : undefined
              }
              title={
                plugin.shortcut
                  ? `${name} (${plugin.shortcut.toUpperCase()})`
                  : name
              }
              aria-label={name}
              className={`relative inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded border ${
                isActive
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-transparent text-fg hover:border-line hover:bg-surface-2"
              }`}
            >
              <Icon
                className="h-[18px] w-[18px]"
                filled={Boolean(plugin.supportsFill) && filled}
              />
              {/* The folded corner: the one hint that a second press on this
                  button opens something. Borrowed from the long-press marks on
                  a phone keyboard, and just as quiet — a tool with nothing
                  behind it wears none. */}
              {opensPanel(plugin) && (
                <span
                  aria-hidden="true"
                  className="absolute right-[3px] bottom-[3px] h-[5px] w-[5px] bg-current opacity-45 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1">
        {/* The ink button. Split corner to corner: the ink you are drawing
            with above the diagonal, the colour that rubs it out below — the
            two colours a drawing hand actually holds. */}
        <button
          ref={colorAnchor}
          type="button"
          onClick={() =>
            setPanel((prev) =>
              prev?.kind === "color" ? null : { kind: "color" },
            )
          }
          aria-haspopup="menu"
          aria-expanded={panel?.kind === "color"}
          aria-label={t("canvas.color")}
          title={t("canvas.color")}
          className={`relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded border border-line hover:border-accent ${
            inkIrrelevant ? "opacity-40" : ""
          }`}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundColor: color,
              clipPath: "polygon(0 0, 100% 0, 0 100%)",
            }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              backgroundColor: background,
              clipPath: "polygon(100% 0, 100% 100%, 0 100%)",
            }}
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 bg-line [clip-path:polygon(100%_0,calc(100%_-_1px)_0,0_calc(100%_-_1px),0_100%)]"
          />
        </button>

        {/* The nib button — the dot is the width, at the width. */}
        <button
          ref={sizeAnchor}
          type="button"
          onClick={() =>
            setPanel((prev) =>
              prev?.kind === "size" ? null : { kind: "size" },
            )
          }
          aria-haspopup="menu"
          aria-expanded={panel?.kind === "size"}
          aria-label={t("canvas.size")}
          title={t("canvas.size")}
          className={`inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-line hover:border-accent ${
            nibIrrelevant ? "opacity-40" : ""
          }`}
        >
          <SizeDot size={size} />
        </button>
      </div>

      {/* The panels themselves. All three open upward: the toolbar is the last
          row on the screen, so each measures the room below it, finds none, and
          flips over the canvas. */}
      {active?.supportsFill && (
        <FillPicker
          open={panel?.kind === "tool" && panel.tool === active.id}
          onClose={() => setPanel(null)}
          anchor={toolAnchor}
          plugin={active}
          filled={filled}
          onPick={(next) => {
            onFilledChange(next);
            setPanel(null);
          }}
        />
      )}

      {active?.clearsPage && (
        <ClearPicker
          open={panel?.kind === "tool" && panel.tool === active.id}
          onClose={() => setPanel(null)}
          anchor={toolAnchor}
          plugin={active}
          hasMarks={pageHasMarks}
          onClear={() => {
            // The panel closes on the way to the dialog: the confirmation is
            // the question now, and leaving a panel hanging behind it would
            // ask the same thing twice.
            setPanel(null);
            onClearPage();
          }}
        />
      )}

      <ColorPicker
        open={panel?.kind === "color"}
        onClose={() => setPanel(null)}
        anchor={colorAnchor}
        color={color}
        onPick={onColorChange}
        background={background}
        customColors={customColors}
        onAddColor={onAddColor}
        onRemoveColor={onRemoveColor}
      />

      <SizePicker
        open={panel?.kind === "size"}
        onClose={() => setPanel(null)}
        anchor={sizeAnchor}
        size={size}
        onPick={onSizeChange}
        customSizes={customSizes}
        onAddSize={onAddSize}
        onRemoveSize={onRemoveSize}
        hardness={hardness}
        onHardnessChange={onHardnessChange}
        hardnessApplies={Boolean(active?.supportsHardness)}
      />
    </div>
  );
}
