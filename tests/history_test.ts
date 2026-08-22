// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  CLEAR,
  committed,
  redone,
  undone,
  windowOf,
  windowOn,
  type Rung,
  type Timeline,
} from "../src/app/history.ts";
import { boxRegion, selectionOf } from "../src/app/selection.ts";
import type { AppData } from "../src/app/types.ts";

// The undo timeline, driven as arithmetic: two stacks and a present, with no
// store, no React and no canvas anywhere near it.
//
// What is worth proving here is the thing that makes selections undoable at
// all — a rung carries the document *and* the window cut in it, so stepping
// back through a marquee restores a window without touching the marks, and
// stepping back through a mark restores the marks without moving the window.

const doc = (activeDrawingId: string): AppData => ({
  folders: [],
  drawings: [],
  activeDrawingId,
});

const window_ = (page: string, x: number) =>
  windowOf(selectionOf(boxRegion({ x, y: 0, width: 10, height: 10 })), page);

const rung = (data: AppData, page = "page-1", x = 0): Rung => ({
  data,
  window: window_(page, x),
});

/** Step back `times` times, answering with the present each step landed on. */
const back = (timeline: Timeline, present: Rung, times: number): Rung[] => {
  const seen: Rung[] = [];
  let at = { timeline, present };
  for (let i = 0; i < times; i++) {
    const next = undone(at.timeline, at.present);
    if (!next) break;
    at = next;
    seen.push(at.present);
  }
  return seen;
};

describe("the timeline", () => {
  it("has nothing to step through when it is clear", () => {
    expect(undone(CLEAR, rung(doc("a")))).toBeNull();
    expect(redone(CLEAR, rung(doc("a")))).toBeNull();
  });

  it("steps back onto the rung a commit put behind it", () => {
    const before = rung(doc("a"));
    const after = rung(doc("b"));
    const stepped = undone(committed(CLEAR, before), after);
    expect(stepped?.present).toEqual(before);
  });

  it("steps forward onto the present it stepped back from", () => {
    const before = rung(doc("a"));
    const after = rung(doc("b"));
    const back_ = undone(committed(CLEAR, before), after);
    const forward = back_ && redone(back_.timeline, back_.present);
    expect(forward?.present).toEqual(after);
  });

  it("forfeits the future when a new rung lands", () => {
    const first = rung(doc("a"));
    const second = rung(doc("b"));
    const back_ = undone(committed(CLEAR, first), second);
    expect(back_).not.toBeNull();
    const fresh = committed(back_!.timeline, back_!.present);
    expect(fresh.future).toHaveLength(0);
    expect(redone(fresh, rung(doc("c")))).toBeNull();
  });
});

describe("a window on the timeline", () => {
  it("comes back with the step that put it away", () => {
    // A selection cut, then cleared: the document never changed, so stepping
    // back is *only* about the window — which is the whole point of it riding
    // here rather than in a `useState` the undo key can't reach.
    const page = doc("page-1");
    const cut: Rung = { data: page, window: window_("page-1", 4) };
    const cleared: Rung = { data: page, window: null };
    const stepped = undone(committed(CLEAR, cut), cleared);
    expect(stepped?.present.data).toBe(page);
    expect(stepped?.present.window?.selection.box.x).toBe(4);
  });

  it("stays put while a mark is taken back", () => {
    // Painting inside a window and undoing that leaves the window up: the mark
    // goes, the outline stays, and the next try costs no re-selecting.
    const up = window_("page-1", 0);
    const before: Rung = { data: doc("a"), window: up };
    const painted: Rung = { data: doc("b"), window: up };
    const stepped = undone(committed(CLEAR, before), painted);
    expect(stepped?.present.window).toBe(up);
    expect(stepped?.present.data).toBe(before.data);
  });

  it("takes back a painted selection one stroke at a time", () => {
    // The draw-select tool builds a window up stroke by stroke, so each stroke
    // is its own rung: three strokes, three steps back, and the third lands on
    // the bare page rather than on some snapshot of the middle of the gesture.
    let timeline = CLEAR;
    let present: Rung = { data: doc("page-1"), window: null };
    for (const x of [1, 2, 3]) {
      timeline = committed(timeline, present);
      present = { data: present.data, window: window_("page-1", x) };
    }
    const steps = back(timeline, present, 3);
    expect(steps.map((s) => s.window?.selection.box.x)).toEqual([
      2,
      1,
      undefined,
    ]);
  });

  it("is shown over the page it was cut in and no other", () => {
    const cut = window_("page-1", 0);
    expect(windowOn(cut, "page-1")).toBe(cut!.selection);
    expect(windowOn(cut, "page-2")).toBeNull();
    expect(windowOn(cut, undefined)).toBeNull();
    expect(windowOn(null, "page-1")).toBeNull();
  });

  it("is nothing at all when the selection is", () => {
    expect(windowOf(null, "page-1")).toBeNull();
  });
});
