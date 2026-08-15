// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import { CogIcon } from "@niclaslindstedt/oss-framework/components";

import { useT } from "./i18n/index.ts";
import { fieldHasKeyboard } from "./keys.ts";
import { toolControl } from "./plugins/controls.ts";
import {
  enabledPlugins,
  pluginById,
  toolbarEntries,
  type ToolbarEntry,
} from "./plugins/registry.ts";
import type { PaintPlugin } from "./plugins/types.ts";
import {
  groupMemberFor,
  sizesFor,
  type AppSettings,
} from "./useAppSettings.ts";
import { ColorPicker } from "./toolbar/ColorPicker.tsx";
import { DialPicker } from "./toolbar/DialPicker.tsx";
import { FillPicker } from "./toolbar/FillPicker.tsx";
import { GroupPicker } from "./toolbar/GroupPicker.tsx";
import { PressPreview } from "./toolbar/PressPreview.tsx";
import { SizePicker } from "./toolbar/SizePicker.tsx";

// The toolbar: the enabled tools, then two buttons for everything about the
// ink.
//
// It renders whatever `toolbarEntries` hands back — the core tools plus
// whatever is switched on in Settings → Tools, in whatever order that page has
// them in — so a new tool needs no change here. Keyboard shortcuts are wired
// from the plugin descriptors for the same reason.
//
// An *entry* is a button, and a button is not always one tool. A family of them
// can share one (`ToolGroup`): the shapes button wears the shape you last held,
// and pressing it again opens the other ten. That is the same second-press
// gesture the fill toggle and the eraser's wipe already use, so the toolbar has
// one rule for "this button does a second job" rather than three.
//
// **Ink is two buttons, not two rows.** A fixed row of seven swatches and four
// nib buttons ate half a phone's toolbar for choices most strokes never change,
// and it grew every time the palette did. Now the colour button is the ink you
// are drawing with, and the size button shows a *press* with the tool in your
// hand: the mark that width actually leaves, painted by the painter that would
// paint it. Each opens its picker over the canvas; both close as soon as you
// have chosen. The row that is left is tools, and it can afford to be.
//
// **The second of those two buttons belongs to the tool, not to the width.**
// The size button is also where a tool's own settings live — its dials, under
// an Advanced heading in the same panel (see `toolbar/SizePicker.tsx`) — and a
// tool with no width to set gets a **cog** in the same slot, opening the same
// dials with nothing above them. A tool with neither gets no button at all,
// where it used to get a dimmed one that opened a panel of widths it ignored.
// Which of the three it is comes off the descriptor (`plugins/controls.ts`), so
// the toolbar hands the picker a list it never reads and never asks which tool
// it is holding.
//
// Fill is not a row either. It lives inside the shapes button's panel, under
// the family: the shape you have picked, drawn hollow and drawn solid. Which
// tools offer it is the descriptor's `supportsFill`, so nothing here knows what
// a rectangle is.
//
// Wiping the page used to ride on that same gesture, hung off the eraser. It
// doesn't any more: throwing a drawing away is not erasing at a larger scale,
// it is an action on the *document*, so it lives with the other document
// actions in the right-hand panel (see `SidePanel.tsx`). The toolbar is tools.

type Props = {
  tool: string;
  onToolChange: (id: string) => void;
  /** The whole settings blob — the toolbar reads three things off it that
   *  belong together: which entries are switched on, what order they are in,
   *  and which member each group last had in hand. */
  settings: AppSettings;
  /** The ink in use, already resolved against the page by the caller. */
  color: string;
  onColorChange: (color: string) => void;
  /** The page colour. Not a choice offered here — it belongs to the drawing's
   *  background layer — but the previews are painted *on* it: a pale nib has to
   *  read on a dark sheet the way it will on the page. */
  background: string;
  customColors: readonly string[];
  onAddColor: (color: string) => void;
  onRemoveColor: (color: string) => void;
  size: number;
  onSizeChange: (size: number) => void;
  customSizes: readonly number[];
  onAddSize: (size: number) => void;
  onRemoveSize: (size: number) => void;
  /** Where the active tool's dials sit, resolved — the size panel's Advanced
   *  section. Which dials those are comes off the plugin descriptor, so the
   *  toolbar never learns one by name (see `plugins/dials.ts`). */
  dialValues: Readonly<Record<string, number>>;
  /** Move one — or forget it with `null`, which is what the panel sends for a
   *  dial dragged back to where it started. */
  onDialChange: (id: string, value: number | null) => void;
  onResetDials: () => void;
  /** Whether any of them are off their default. */
  dialsTuned: boolean;
  filled: boolean;
  onFilledChange: (filled: boolean) => void;
};

/** Whether an entry's button does a second job once it is the one in your hand.
 *  Read off descriptor flags — a group always has one (the family behind it),
 *  and a lone tool joins the gesture by declaring `supportsFill` rather than by
 *  being named here. */
function opensPanel(entry: ToolbarEntry, plugin: PaintPlugin | undefined) {
  if (entry.kind === "group") return true;
  return Boolean(plugin?.supportsFill);
}

export function Toolbar({
  tool,
  onToolChange,
  settings,
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
  dialValues,
  onDialChange,
  onResetDials,
  dialsTuned,
  filled,
  onFilledChange,
}: Props) {
  const t = useT();
  const entries = toolbarEntries(settings.enabledPlugins, settings.toolOrder);
  // What each button stands for right now: the tool itself for a lone one, the
  // member you last held for a family (see `groupMemberFor`).
  const shownFor = (entry: ToolbarEntry): PaintPlugin | undefined =>
    entry.kind === "tool"
      ? entry.plugin
      : groupMemberFor(settings, entry, tool);
  const active = pluginById(tool);
  // The entry whose button is currently pressed in — the one the active tool
  // belongs to, whether it stands alone or in a family.
  const activeEntry = entries.find((entry) =>
    entry.kind === "tool" ? entry.id === tool : shownFor(entry)?.id === tool,
  );
  // Which panel is open. One at a time, and held as a discriminated value
  // rather than three booleans so opening one can never leave another hanging
  // over the canvas. A tool's own panel names its entry: switching tools with it
  // open must not leave it anchored to a button that no longer means anything.
  const [panel, setPanel] = useState<
    | { kind: "tool"; entry: string }
    | { kind: "color" }
    | { kind: "settings" }
    | null
  >(null);
  const toolAnchor = useRef<HTMLButtonElement | null>(null);
  const colorAnchor = useRef<HTMLButtonElement | null>(null);
  // The size button and the cog are the same slot — only one of them is ever
  // rendered — so they share the anchor their panel opens over.
  const settingsAnchor = useRef<HTMLButtonElement | null>(null);

  // A tool that lifts ink (the eraser) or moves the view (the hand) has no use
  // for the colour, so its swatch is dimmed. Read off descriptor flags —
  // nothing here knows a tool by name.
  const inkIrrelevant =
    active?.erases ||
    active?.navigates ||
    active?.picksColor ||
    active?.selects;
  // What the button beside the ink is for this tool: its width, its own
  // settings, or nothing (see `plugins/controls.ts`).
  const control = toolControl(active);

  // Single-key tool shortcuts, read straight off the plugin descriptors. Held
  // back while a text field or a dialog owns the keyboard so typing a drawing's
  // name doesn't swap the pencil for the eraser.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (fieldHasKeyboard(e.target)) return;
      // Every offered tool, not every button: a shape inside the shapes group
      // still answers to its own letter without having a button of its own.
      const offered = enabledPlugins(settings.enabledPlugins);
      const match = offered.find((p) => p.shortcut === e.key.toLowerCase());
      if (!match) return;
      e.preventDefault();
      // A tool picked from the keyboard closes whatever panel was open rather
      // than leaving it hanging there.
      setPanel(null);
      onToolChange(match.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settings.enabledPlugins, onToolChange]);

  return (
    // The toolbar is the last thing above the screen edge, and the app paints
    // under the home indicator (`viewport-fit=cover`), so it carries the bottom
    // safe-area inset plus 10px — enough that the buttons stay a comfortable
    // thumb reach above the indicator instead of sitting on it.
    <div
      className="flex flex-wrap items-center gap-1 border-t border-line bg-surface px-3 pt-2 [padding-bottom:calc(env(safe-area-inset-bottom)+10px)]"
      role="toolbar"
      aria-label={t("canvas.toolbar")}
    >
      {/* The tools are their own group for a screen reader, but not their own
          box for the layout: `contents` drops the wrapper's box so each button
          wraps in the toolbar's own flow. Nested, the group filled a line of
          its own and pushed the ink buttons onto a third row of their own —
          two rows of dead width on a phone. Flat, the ink follows the last
          tool onto the row it was already sharing. */}
      <div className="contents" role="group">
        {entries.map((entry) => {
          const shown = shownFor(entry);
          if (!shown) return null;
          const Icon = shown.icon;
          const isActive = entry.id === activeEntry?.id;
          // A family's button is named for the group, so its tooltip says what
          // pressing it again opens; a lone tool's is named for itself.
          const name =
            entry.kind === "group" ? t(entry.group.nameKey) : t(shown.nameKey);
          // Some buttons do two jobs: pick the tool, and — once it is the one
          // you are holding — open that button's own panel (the family behind
          // it). That is the "press it twice" gesture, and it costs the toolbar
          // nothing.
          const second = opensPanel(entry, shown);
          const opensOwn = second && isActive;
          return (
            <button
              key={entry.id}
              type="button"
              ref={opensOwn ? toolAnchor : undefined}
              onClick={() => {
                setPanel(opensOwn ? { kind: "tool", entry: entry.id } : null);
                if (shown.id !== tool) onToolChange(shown.id);
              }}
              aria-pressed={isActive}
              aria-haspopup={opensOwn ? "menu" : undefined}
              aria-expanded={
                opensOwn
                  ? panel?.kind === "tool" && panel.entry === entry.id
                  : undefined
              }
              title={
                shown.shortcut
                  ? `${name} (${shown.shortcut.toUpperCase()})`
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
                filled={Boolean(shown.supportsFill) && filled}
              />
              {/* The folded corner: the one hint that a second press on this
                  button opens something. Borrowed from the long-press marks on
                  a phone keyboard, and just as quiet — a tool with nothing
                  behind it wears none. */}
              {second && (
                <span
                  aria-hidden="true"
                  className="absolute right-[3px] bottom-[3px] h-[5px] w-[5px] bg-current opacity-45 [clip-path:polygon(100%_0,100%_100%,0_100%)]"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* The ink pair stays one box: it wraps as a unit rather than splitting
          the colour from the nib, and the extra left margin is the seam between
          the tools and the ink the flattened gap no longer draws. */}
      <div className="ml-2 flex items-center gap-1">
        {/* The ink button: the colour you are drawing with, whole. It used to
            be split corner to corner with the page colour below the diagonal,
            back when painting *with* the page was how you rubbed something out.
            The eraser lifts ink now (see `render.ts`) and the sheet's colour
            belongs to the background layer, so the second half stood for
            nothing. */}
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
          className={`h-9 w-9 shrink-0 cursor-pointer rounded border border-line hover:border-accent ${
            inkIrrelevant ? "opacity-40" : ""
          }`}
          style={{ backgroundColor: color }}
        />

        {/* The nib button — a press with the tool in your hand, on your page,
            in your ink. Not a dot the width of the nib: what a width *is* is
            different for every tool, and the mark itself is the only preview
            that can say so (see `toolbar/PressPreview.tsx`) — bar the tools
            whose mark can't describe itself, which ask for a plain circle
            instead (`sizePreview`). */}
        {control === "size" && (
          <button
            ref={settingsAnchor}
            type="button"
            onClick={() =>
              setPanel((prev) =>
                prev?.kind === "settings" ? null : { kind: "settings" },
              )
            }
            aria-haspopup="menu"
            aria-expanded={panel?.kind === "settings"}
            aria-label={t("canvas.size")}
            title={t("canvas.size")}
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-line hover:border-accent"
          >
            <PressPreview
              plugin={active}
              size={size}
              of={sizesFor(active, customSizes).at(-1) ?? size}
              color={color}
              background={background}
              dials={dialValues}
              filled={filled}
              box={26}
            />
          </button>
        )}

        {/* …and the cog, in the same slot, for a tool that has settings but no
            width — the bucket. A dot beside it when it is set away from how it
            ships, which is the one thing a cog can't show on its face. */}
        {control === "dials" && (
          <button
            ref={settingsAnchor}
            type="button"
            onClick={() =>
              setPanel((prev) =>
                prev?.kind === "settings" ? null : { kind: "settings" },
              )
            }
            aria-haspopup="menu"
            aria-expanded={panel?.kind === "settings"}
            aria-label={t("canvas.toolSettings")}
            title={t("canvas.toolSettings")}
            className="relative inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-line text-fg hover:border-accent"
          >
            <CogIcon className="h-[18px] w-[18px]" />
            {dialsTuned && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-accent"
              />
            )}
          </button>
        )}
      </div>

      {/* The panels themselves. All of them open upward: the toolbar is the
          last row on the screen, so each measures the room below it, finds
          none, and flips over the canvas. */}
      {/* A family's panel: the rest of the shapes, and how they are drawn. It
          stays open as you try them — picking a shape is what the panel is for,
          and closing on the first one would mean re-opening it to compare two. */}
      {activeEntry?.kind === "group" && (
        <GroupPicker
          open={panel?.kind === "tool" && panel.entry === activeEntry.id}
          onClose={() => setPanel(null)}
          anchor={toolAnchor}
          name={t(activeEntry.group.nameKey)}
          members={activeEntry.members}
          active={active}
          onPick={onToolChange}
          filled={filled}
          onFilledChange={onFilledChange}
        />
      )}

      {/* A lone tool that fills — none ship today, every shape being in the
          family above, but the flag is the descriptor's and a build that adds
          one gets the picker without touching the toolbar. */}
      {activeEntry?.kind === "tool" && active?.supportsFill && (
        <FillPicker
          open={panel?.kind === "tool" && panel.entry === activeEntry.id}
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

      <ColorPicker
        open={panel?.kind === "color"}
        onClose={() => setPanel(null)}
        anchor={colorAnchor}
        color={color}
        onPick={onColorChange}
        customColors={customColors}
        onAddColor={onAddColor}
        onRemoveColor={onRemoveColor}
      />

      {/* Whichever panel the slot's button opens. Never both: `toolControl`
          answers with one of the two or with neither, and a tool with neither
          has no button to open one from. */}
      {control === "size" && (
        <SizePicker
          open={panel?.kind === "settings"}
          onClose={() => setPanel(null)}
          anchor={settingsAnchor}
          plugin={active}
          size={size}
          onPick={onSizeChange}
          color={color}
          background={background}
          filled={filled}
          customSizes={customSizes}
          onAddSize={onAddSize}
          onRemoveSize={onRemoveSize}
          dials={active?.dials ?? []}
          values={dialValues}
          onDialChange={onDialChange}
          onResetDials={onResetDials}
          tuned={dialsTuned}
        />
      )}

      {control === "dials" && (
        <DialPicker
          open={panel?.kind === "settings"}
          onClose={() => setPanel(null)}
          anchor={settingsAnchor}
          plugin={active}
          dials={active?.dials ?? []}
          values={dialValues}
          onDialChange={onDialChange}
          onResetDials={onResetDials}
          tuned={dialsTuned}
        />
      )}
    </div>
  );
}
