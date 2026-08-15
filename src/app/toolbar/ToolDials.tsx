// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useT } from "../i18n/index.ts";
import { dialChoice, dialReadout } from "../plugins/dials.ts";
import type { ToolDial } from "../plugins/types.ts";

// A tool's own knobs, as a titled section of a panel.
//
// It sits under the widths in the size panel and it *is* the cog panel, which
// is the reason it is a component rather than a block of the size picker: the
// paint bucket has no width to put them under, and two renderings of one idea
// would have drifted the first time a dial gained a control.
//
// **The section is open.** It used to be a disclosure — a row you pressed to
// unfold the sliders — on the reasoning that the basic panel should stay the
// one control a hand reaches for mid-stroke. That reasoning was wrong twice
// over: a fold you have to open every time you open the panel is not a saving,
// and a dot beside a collapsed heading is a poor way to say "this tool is set
// differently from how it ships" when showing the sliders says it outright. So
// the heading stays — the dials are still a section, still below the width, and
// still named — and everything under it is simply there.
//
// Nothing here knows a dial by name. The plugin declares them, `dials.ts` says
// where each one rests and how it reads out, and this renders the list: a
// paintbrush's hair gauge and a bucket's feather are the same loop.

type Props = {
  /** The section's heading. The size panel calls it **Advanced** — the dials
   *  are the part past the width. The cog panel names the tool instead: there
   *  is nothing above them there, so what the section needs to say is which
   *  tool you are setting. */
  title: string;
  /** What the tool in hand offers, in the order it declared them. */
  dials: readonly ToolDial[];
  /** Where they currently sit — every one of them, resolved, so a slider has a
   *  value whether or not the user has touched it. */
  values: Readonly<Record<string, number>>;
  /** Move one — or forget it with `null`, which is what a slider dragged back
   *  to where it started sends, so nothing is kept that isn't doing anything. */
  onChange: (id: string, value: number | null) => void;
  /** Put this tool back the way it came. Offered only once something is
   *  actually off its default. */
  onReset: () => void;
  tuned: boolean;
};

export function ToolDials({
  title,
  dials,
  values,
  onChange,
  onReset,
  tuned,
}: Props) {
  const t = useT();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {/* The house style for a section heading (the side panel's and the
            drawer's), which is what earns the row: without it the title read as
            one more slider label in a stack of them. */}
        <span className="text-xs font-bold tracking-wide text-muted uppercase">
          {title}
        </span>
        {/* **Reset** appears only when there is something to undo — on a tool
            as it ships it would be a button that does nothing, and its absence
            is itself the answer to "have I changed anything here?". */}
        {tuned && (
          <button
            type="button"
            onClick={onReset}
            className="cursor-pointer text-xs text-muted hover:text-fg-bright"
          >
            {t("dials.reset")}
          </button>
        )}
      </div>

      {dials.map((dial) => {
        const rest = dial.default ?? 1;
        const value = values[dial.id] ?? rest;
        // Back where it started is not a setting: forget it, so the blob only
        // ever holds what differs from the tool as it ships.
        const move = (next: number) =>
          onChange(dial.id, next === rest ? null : next);
        const chosen = dialChoice(dial, value);
        return (
          <label key={dial.id} className="flex flex-col gap-1">
            <span className="text-xs text-muted">
              {t(dial.nameKey, { value: dialReadout(dial, value) })}
            </span>
            {/* A dial with a handful of values is *pressed*. There is nothing
                between a 2B and a 3B, so dragging a slider until the readout
                says "3B" is hunting for something you could have named — see
                `ToolDial.choices`. Everything else is a slider, and the two
                render from the same descriptor. */}
            {dial.choices ? (
              <span className="flex flex-wrap gap-1">
                {dial.choices.map((choice) => (
                  <button
                    key={choice.label}
                    type="button"
                    onClick={() => move(choice.value)}
                    aria-pressed={choice.value === chosen?.value}
                    className={`min-w-7 cursor-pointer rounded border px-1.5 py-1 text-[11px] leading-none ${
                      choice.value === chosen?.value
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-line text-muted hover:bg-surface-2"
                    }`}
                  >
                    {choice.label}
                  </button>
                ))}
              </span>
            ) : (
              <input
                type="range"
                min={dial.min}
                max={dial.max}
                step={dial.step}
                value={value}
                onChange={(e) =>
                  move(Number((e.target as HTMLInputElement).value))
                }
                className="w-full cursor-pointer"
              />
            )}
            <span className="text-[11px] text-muted">{t(dial.hintKey)}</span>
          </label>
        );
      })}
    </div>
  );
}
