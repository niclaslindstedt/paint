// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useEffect, useRef, useState } from "react";

import type { EffectControl } from "./effects.ts";

// One of an effect's numbers, and the question of *when* the page hears about
// it.
//
// A range input is a controlled input like any other, and for most of these
// effects that is the whole story: the thumb moves, the draft changes, the page
// behind the dialog repaints through the same composite the bake will use (see
// `EffectModal`). Live is the point — a radius in page pixels is not a number
// anyone can picture.
//
// It stops being the point when the picture cannot keep up. A pointer reports a
// hundred-odd samples a second and every one of them is a whole repaint; where
// that repaint solves for a traced subject's edge, or copies the window off and
// lays it back through a filter, the frames fall behind the thumb and keep
// falling. What you get is not a slower preview but a *wrong* one: the picture
// on screen is answering the value you passed through half a second ago, so the
// only way to read it is to let go and wait, which is exactly what the slider
// was supposed to save you.
//
// So an effect whose preview costs more than a frame says `settles` on its
// descriptor, and this holds that slider's value for the length of the drag.
// The label follows the thumb — the *number* is free, and watching it move is
// half of what a slider is for — and the draft is handed the value the moment
// the hand lets go.
//
// "The moment the hand lets go" is the native `change` event, which is what it
// has always meant on a range input: once per release for a pointer, once per
// press for the arrow keys. React's `onChange` is the `input` event under
// another name, so the commit is a listener of our own — the one place in this
// app that reaches past React for an event, and it does so because the browser
// already knows the answer to the question being asked.

type Props = {
  control: EffectControl;
  /** The value on the draft. What is shown while a settling slider is under the
   *  hand is the held one below; this is what it goes back to being. */
  value: number;
  /** The control's label, with the value already read into it — a function
   *  because on a settling slider the label is ahead of the draft. */
  label: (value: number) => string;
  /** Wait for the release before handing the value over. */
  settles: boolean;
  onChange: (next: number) => void;
};

export function EffectSlider({
  control,
  value,
  label,
  settles,
  onChange,
}: Props) {
  const ref = useRef<HTMLInputElement | null>(null);
  // The value under the hand, on a settling slider mid-drag — `null` whenever
  // the draft and the thumb agree, which is every frame of every other slider.
  // Held twice over because the two readers want different things: the render
  // wants a value it re-runs on, and the commit listener wants the latest one
  // without having re-subscribed for it.
  const [held, setHeld] = useState<number | null>(null);
  const heldRef = useRef<number | null>(null);
  const hold = (next: number | null) => {
    heldRef.current = next;
    setHeld(next);
  };

  // The listener outlives any one render, so the handler it calls is read off a
  // ref rather than closed over: a commit must reach the dialog as it is now,
  // not as it was when the pointer went down.
  const commit = useRef(onChange);
  commit.current = onChange;

  useEffect(() => {
    const input = ref.current;
    if (!input || !settles) return;
    const onCommit = () => {
      const pending = heldRef.current;
      if (pending === null) return;
      hold(null);
      commit.current(pending);
    };
    input.addEventListener("change", onCommit);
    return () => input.removeEventListener("change", onCommit);
  }, [settles]);

  // A slider let go of outside the window, or tabbed away from with a drag
  // still notionally in hand, would otherwise sit on a value the draft never
  // heard. `change` normally beats this to it and the held value is already
  // gone; this is the floor under that.
  const flush = () => {
    const pending = heldRef.current;
    if (pending === null) return;
    hold(null);
    commit.current(pending);
  };

  const shown = held ?? value;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-muted">{label(shown)}</span>
      <input
        ref={ref}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={shown}
        onChange={(e) => {
          const next = Number((e.target as HTMLInputElement).value);
          if (settles) hold(next);
          else onChange(next);
        }}
        onBlur={flush}
        className="w-full cursor-pointer"
      />
    </label>
  );
}
