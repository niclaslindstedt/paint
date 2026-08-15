// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The selection family — the gestures that choose marks instead of making one.
//
// They are deliberately *ordinary* tools: `start` / `move` / `end` build the
// same drafts a rectangle, a pencil line and a bucket fill build, and the
// painters below draw them as marching ants. That is the whole trick — the drag
// pipeline, the abandon-on-pinch rule, the edge-swipe hold and the frame
// coalescing are the ones every tool already goes through, and these inherit
// them by being tools.
//
// What is different is where the gesture *lands*. Each descriptor carries
// `selects`, and the canvas reads that flag to ask the behaviour one more
// question — `selection(draft)`, "what did this gesture choose?" — and hands the
// outlines that come back to the screen instead of filing them as a stroke. The
// answer is always **closed contours in document coordinates**, whatever the
// gesture was, which is what lets a lasso, an oval and a traced area all be
// selections without the screen learning a fourth shape (see `selection.ts`).
// Nothing in the canvas, the store or the renderer knows what a selection tool
// is called, and no stroke ever carries one of these ids.
//
// Four of them, behind one button (`SELECT_GROUP_ID` — the same `ToolGroup` the
// shapes use, so they cost one toolbar slot and one switch between them):
//
//   - **box**    the classic marquee: two corners.
//   - **oval**   the same drag, read as the ellipse inscribed in it.
//   - **lasso**  freehand — draw around what you want and the loop closes
//                itself.
//   - **trace**  press an area and the selection follows the *contours* of what
//                is painted there rather than a shape you drew over it. It is
//                the bucket's flood, borrowed: the same probe, the same tracing,
//                and the outline goes to the screen instead of the document.
//
// What you can then do with the marks is the screen's business (see
// `selection.ts` and `CanvasScreen.tsx`): move them with the hand, and copy, cut
// or delete them from the keyboard or the menu a right-click or a long press
// opens.

import type { Point } from "../../types.ts";
import { isMeaningfulDrag, normalizeBox, polygonCorners } from "../ink.ts";
import type { DraftStroke, ToolBehaviour, ToolContext } from "../types.ts";

/** The group the selection tools share a button and a switch under.
 *
 *  It is the id the box marquee used to hold alone, and deliberately so: it is
 *  what a settings blob written before the family existed has in its enabled
 *  list and its toolbar order, so an install that had the marquee switched on
 *  gets the family in the same slot rather than losing its button. */
export const SELECT_GROUP_ID = "select";

/** The plugin ids the selection tools register under. They are never persisted
 *  on a stroke — none of these tools commits one — but they are the ids the
 *  toolbar and the settings blob hold, so they are fixed all the same. The box
 *  marquee keeps the bare `select` it shipped as. */
export const SELECT_TOOL_ID = "select";
export const SELECT_OVAL_TOOL_ID = "select-oval";
export const SELECT_LASSO_TOOL_ID = "select-lasso";
export const SELECT_TRACE_TOOL_ID = "select-trace";

/** How long a dashed marquee's dashes are, in **device** pixels. Divided by the
 *  render scale before it reaches the context, so the ants stay the same size on
 *  screen at any zoom — a dash measured in document pixels disappears when you
 *  pull back and turns into a picket fence when you zoom in. */
const DASH = 6;

/** How many corners an oval marquee's outline is cut into when it is handed
 *  over as a contour. Sixty-four is under a tenth of a document pixel off a true
 *  ellipse at any size a page can be, and the outline is thrown away as soon as
 *  the marks are picked — nothing here reaches the document. */
const OVAL_CORNERS = 64;

/** How far the pointer has to travel before a lasso keeps another point. A
 *  pointer stream is far finer than a selection needs, and every sample kept is
 *  an edge the hit test walks for every mark on the page. */
const LASSO_STEP = 1.5;

/** A marquee is chrome rather than ink: it carries no colour (so nothing
 *  resolves one against the page) and the width is the hairline the painters
 *  below override anyway. The tool id is left blank because the canvas stamps
 *  the one actually in hand. */
const chrome = (shape: DraftStroke["shape"]): DraftStroke => ({
  tool: "",
  size: 1,
  shape,
});

// --- The ants ----------------------------------------------------------------

/** Draw marching ants along whatever `trace` puts on the path.
 *
 *  Two passes — a pale solid line under a dark dashed one — so the outline is
 *  visible over a dark drawing and over a light one without knowing which it is
 *  on. `trace` is called once per pass and begins its own path. */
function paintAnts(
  ctx2d: CanvasRenderingContext2D,
  scale: number,
  trace: (path: CanvasRenderingContext2D) => void,
): void {
  const hairline = 1 / Math.max(scale, 0.0001);
  ctx2d.globalAlpha = 1;
  ctx2d.lineWidth = hairline;
  // `setLineDash` is the one 2D call outside the export recorder's vocabulary
  // (see `svg.ts`), and it can be: a marquee is chrome and never exports. Guard
  // it anyway so a painter called with a stand-in context still draws an
  // outline.
  const dashes =
    typeof ctx2d.setLineDash === "function"
      ? ctx2d.setLineDash.bind(ctx2d)
      : null;
  dashes?.([]);
  ctx2d.strokeStyle = "rgba(255,255,255,0.85)";
  trace(ctx2d);
  ctx2d.stroke();
  dashes?.([DASH * hairline, DASH * hairline]);
  ctx2d.strokeStyle = "rgba(17,24,39,0.9)";
  trace(ctx2d);
  ctx2d.stroke();
  dashes?.([]);
}

/** Draw a marching-ants rectangle at `box`, in document coordinates.
 *
 *  Shared with the canvas, which outlines the *settled* selection with the same
 *  ants so the marquee you dragged and the selection you got read as one
 *  thing. */
export function paintMarquee(
  ctx2d: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  scale: number,
): void {
  paintAnts(ctx2d, scale, (path) => {
    path.beginPath();
    path.rect(box.x, box.y, box.width, box.height);
  });
}

/** Put one closed run of points on the path. */
function tracePolygon(
  path: CanvasRenderingContext2D,
  points: readonly Point[],
): void {
  const first = points[0];
  if (!first) return;
  path.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i++) {
    path.lineTo(points[i]!.x, points[i]!.y);
  }
  path.closePath();
}

// --- The gestures ------------------------------------------------------------

/** The two-corner half every marquee shares: a drag that records where it began
 *  and where it is now, kept whatever it did. A stray tap is kept too — a tap
 *  inside a selection tool means "select nothing", and dropping it would leave
 *  the last selection hanging around after an obvious attempt to clear it. */
const cornerDrag = {
  start: (p: Point): DraftStroke => chrome({ kind: "box", from: p, to: p }),
  move: (draft: DraftStroke, p: Point): DraftStroke => {
    if (draft.shape.kind !== "box") return draft;
    return { ...draft, shape: { kind: "box", from: draft.shape.from, to: p } };
  },
  end: (draft: DraftStroke): DraftStroke => draft,
};

/** The two corners of a drag that actually went somewhere, or `null` for a tap.
 *  The one place the "did this drag mean anything?" question is asked for the
 *  marquees — a press that never moved chooses nothing rather than choosing a
 *  box a pixel across. */
function draggedBox(draft: DraftStroke) {
  if (draft.shape.kind !== "box") return null;
  const { from, to } = draft.shape;
  return isMeaningfulDrag(from, to) ? normalizeBox(from, to) : null;
}

/** The corners of a box, as a contour. */
function boxCorners(box: {
  x: number;
  y: number;
  width: number;
  height: number;
}): Point[] {
  return [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x + box.width, y: box.y + box.height },
    { x: box.x, y: box.y + box.height },
  ];
}

/** The box marquee: the selection every paint program opens with. */
export const selectBehaviour: ToolBehaviour = {
  ...cornerDrag,
  paint: (ctx2d, stroke, detail) => {
    if (stroke.shape.kind !== "box") return;
    const box = normalizeBox(stroke.shape.from, stroke.shape.to);
    paintMarquee(ctx2d, box, detail?.scale ?? 1);
  },
  selection: (draft) => {
    const box = draggedBox(draft);
    return box ? [boxCorners(box)] : null;
  },
};

/** The oval marquee: the same drag, read as the ellipse inscribed in it —
 *  which is exactly how the ellipse *shape* tool reads the same two corners. */
export const selectOvalBehaviour: ToolBehaviour = {
  ...cornerDrag,
  paint: (ctx2d, stroke, detail) => {
    if (stroke.shape.kind !== "box") return;
    const box = normalizeBox(stroke.shape.from, stroke.shape.to);
    paintAnts(ctx2d, detail?.scale ?? 1, (path) => {
      path.beginPath();
      // Drawn as a true ellipse rather than as the polygon it is handed over
      // as: the outline on screen is chrome, and a curve is what an oval
      // marquee looks like.
      path.ellipse(
        box.x + box.width / 2,
        box.y + box.height / 2,
        box.width / 2,
        box.height / 2,
        0,
        0,
        Math.PI * 2,
      );
    });
  },
  selection: (draft) => {
    const box = draggedBox(draft);
    if (!box) return null;
    // A regular polygon of enough sides inscribed in the box *is* the ellipse
    // inscribed in it — the same corner-finding the polygon shapes use.
    return [
      polygonCorners(
        { x: box.x, y: box.y },
        { x: box.x + box.width, y: box.y + box.height },
        OVAL_CORNERS,
      ),
    ];
  },
};

/** The lasso: draw around what you want, freehand, and the loop closes itself.
 *
 *  The draft is an ordinary `path` — the same shape a pencil line records — so
 *  it costs no new geometry anywhere; only the painter and the answer below
 *  differ. */
export const selectLassoBehaviour: ToolBehaviour = {
  start: (p) => chrome({ kind: "path", points: [p] }),
  move: (draft, p) => {
    if (draft.shape.kind !== "path") return draft;
    const points = draft.shape.points;
    const last = points[points.length - 1];
    // Thinned as it is drawn rather than after: every point kept is an edge the
    // hit test walks once per mark on the page.
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < LASSO_STEP) {
      return draft;
    }
    return { ...draft, shape: { kind: "path", points: [...points, p] } };
  },
  end: (draft) => draft,
  paint: (ctx2d, stroke, detail) => {
    if (stroke.shape.kind !== "path") return;
    const points = stroke.shape.points;
    if (points.length < 2) return;
    // Closed while it is still being drawn: the loop is what will be selected,
    // so showing it open would be showing something else.
    paintAnts(ctx2d, detail?.scale ?? 1, (path) => {
      path.beginPath();
      tracePolygon(path, points);
    });
  },
  selection: (draft) => {
    if (draft.shape.kind !== "path") return null;
    const points = draft.shape.points;
    // Three points is the least that encloses anything, and a loop that never
    // left the press is a tap: both mean "select nothing".
    if (points.length < 3) return null;
    const first = points[0]!;
    return points.some((p) => isMeaningfulDrag(first, p)) ? [points] : null;
  },
};

/** Whether two colours off the page are the same one. Both sides come from the
 *  same two places — the probe's `#rrggbb` and the resolved page colour — so a
 *  string compare is the whole of it, bar the case. */
function sameColor(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** The area under `p`, traced — or `null` when there is nothing there to trace:
 *  no probe, off the page, an outline too thin to enclose anything, or **the
 *  bare sheet**.
 *
 *  That last one is the whole reason this isn't just a call to `regionAt`. The
 *  page colour floods to the shape of everything *around* the marks, and every
 *  mark on the page borders it — so a press on an empty corner would trace an
 *  area touching the lot and hand back the entire drawing as the selection. The
 *  press that means the least would select the most, and one Delete later the
 *  page would be blank.
 *
 *  So a press that lands on the page colour chooses nothing, which is what a
 *  press on nothing means everywhere else in this family. Press the mark you
 *  want, not the gap beside it. */
function tracedAt(p: Point, ctx: ToolContext): Point[][] | null {
  const under = ctx.probe?.colorAt(p);
  if (!under || sameColor(under, ctx.background)) return null;
  const contours = ctx.probe?.regionAt(p);
  if (!contours || !contours.some((loop) => loop.length >= 3)) return null;
  return contours;
}

/** The tracing selection: press an area and the selection follows the contours
 *  of what is painted there.
 *
 *  It is the bucket's gesture with the bucket's machinery — the same rasterised
 *  snapshot of the page (`ToolContext.probe`), the same flood, the same contour
 *  tracing (see `flood.ts`) — and the only difference is where the outline goes:
 *  to the screen as a selection rather than into the document as a fill. That is
 *  what makes it *align with what is drawn* instead of with a shape you dragged
 *  over it, and it is why the app grew no new geometry to get it.
 *
 *  Like the bucket it is a press tool: dragging re-aims it rather than extending
 *  anything, so the outline follows the pointer into whichever area it is over
 *  now. A press that finds nothing keeps an empty draft rather than refusing to
 *  begin, so lifting still says "select nothing" the way every other selection
 *  tool's tap does. */
export const selectTraceBehaviour: ToolBehaviour = {
  start: (p, ctx) =>
    chrome({ kind: "region", contours: tracedAt(p, ctx) ?? [] }),
  move: (draft, p, ctx) => {
    const contours = tracedAt(p, ctx);
    return contours ? { ...draft, shape: { kind: "region", contours } } : draft;
  },
  end: (draft) => draft,
  paint: (ctx2d, stroke, detail) => {
    if (stroke.shape.kind !== "region") return;
    const contours = stroke.shape.contours;
    if (contours.length === 0) return;
    paintAnts(ctx2d, detail?.scale ?? 1, (path) => {
      path.beginPath();
      for (const loop of contours) {
        if (loop.length >= 3) tracePolygon(path, loop);
      }
    });
  },
  selection: (draft) => {
    if (draft.shape.kind !== "region") return null;
    const contours = draft.shape.contours.filter((loop) => loop.length >= 3);
    return contours.length > 0 ? contours : null;
  },
};
