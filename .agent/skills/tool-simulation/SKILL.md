---
name: tool-simulation
description: "Use when building or improving a physical simulation of a drawing medium — an ink pen, a lead, a wash, a crayon — in place of a geometric painter. Sets up the reference-research → field-model → render/measure loop, and records the architecture rules (grows contract, dried-mark store, incremental live walk, budgets) that keep a simulated tool at frame rate."
---

# Tool simulation

A geometric painter draws what the gesture was; a simulation draws what the
_medium did_ — and the difference is the whole reason anyone prefers one tool
over another. This skill is the method that produced the pencil (`leadSim`),
the watercolour (`washSim`) and the calligraphy ink (`quillSim`): start from
photographs of the real thing, model the two or three numbers per cell that
generate its behaviours, and judge every tuning change with a render you
cropped and a number you probed — never by eye on a full-size sheet, and never
from the source code.

## Start on the internet, not in the editor

**Do not write a line of the model until you have real output of the real tool
in front of you.** The single highest-leverage act of a simulation session is
studying scans and photographs of the medium — pen-and-ink review sheets,
scanned sketchbooks, close-ups of washes — because they turn "make it look
real" into a finite checklist of behaviours you can point at.

1. Search for scans of the medium's output: ink/nib/paper review blogs are
   gold (they photograph the same pen on many papers, at high resolution,
   with the failure modes on purpose — "look at these hairlines", dry-out
   drills, ink-shading comparisons). Fetch them into the scratchpad with
   `curl` and Read them.
2. Write down every behaviour you can _see_, as one line each. For the
   calligraphy pen the list read: ink shades with hand speed; pools at the
   touch-down and the lift; crossings dry darker (translucent film adds);
   long strokes pale → rail (centre hollows, corners keep writing) → break
   on the tooth → give out; edges feather slightly on absorbent paper;
   hairlines are pale. That list **is the spec** — every item becomes a term
   in the model and a row on the exercise sheet.
3. Keep the references open for the whole session. Every render is judged
   against them, not against your memory of them.
4. When the user supplies reference images, treat them as the acceptance
   test. When they don't, find your own — and say which you used.

## The model shape that works

All three engines converged on the same skeleton; start from it.

- **A field over a patch of page**: one or two `Float32Array`s per quantity
  (sheet height, deposited film/load), plus a `Uint8Array` of which cells have
  had the expensive sheet worked out (**lazy** — a mark touches its band, not
  its bounding box). Split it `<medium>Field.ts` (knows the material, nothing
  about gestures) / `<medium>Sim.ts` (walks a gesture over it) — the field is
  then testable with no canvas at all.
- **Share the paper.** `sheetDip` / `sheetRelief` in `leadField.ts` are the
  one description of where the page is high and low. Every medium must read
  the same sheet, or a pen line and a pencil line disagree about where the
  paper is — and the grain the user sees painted under the marks is a third
  opinion. Hash everything off _page position_ (`grain.ts`) so repaints and
  crossing strokes agree forever.
- **Deposit → pixels via Beer–Lambert**, through `keeping`/`washFilm` from
  `washSim.ts` — it is exact under the `multiply`/`screen` the wet-ground
  compositing already uses and it mirrors dark pages correctly for free.
- **One walk function is the spec.** If a live/incremental path exists, it
  must call the same per-touch function (`lay`) as the one-shot walk, so the
  two cannot drift.

## Tuning: render, crop, probe — in that order

- `scripts/ink-sheet.ts` renders the pen's exercise sheet straight from the
  field (no DOM, node only) — one row per claimed behaviour. Adapt it for a
  new medium by swapping the field/walk imports and rewriting the rows.
- **Small renders lie.** A ribbon that looks flat navy at 1× is often a
  perfectly good simulation whose shading only reads at 3×. Crop before
  concluding anything: `scripts/zoom.ts <sheet.png> x y w h [zoom]`.
- **Then get the number.** `scripts/probe-ink.ts` prints mean film per
  window (slow vs fast section, head vs tail), coverage when starved, and
  per-simulation cost. A retune is `probe → change one constant → probe`.

Tuning lessons that cost real time:

- **Beer–Lambert compresses at the dark end.** If the mark's working range
  maps to density ≳1, every behaviour saturates into the same solid and the
  simulation is invisible — which is exactly the flat painter it replaced.
  Put the _normal_ stroke mid-curve (quill: `DENSITY 0.55`, film ~1) so
  pools and crossings have somewhere darker to go.
- **Floor the transmittance** (`KEEP_FLOOR`): near-black ink at `keep=0.02`
  clips to solid; at 0.06 it still shades like real india ink.
- **Speed curves need sharpening.** Hand speed read off stored sample gaps
  spans ~2–40 px; a plain `1/(1+v/k)` huddles everything mid-range. Raise it
  to a power (`SPEED_SHARP 1.5`) so the real range spans the film range.
- **A fixed sampling lattice bands.** Stamping the nib edge at fixed
  fractional positions beats against the cell grid as longitudinal stripes;
  slide the lattice by a hashed phase per touch and the same arithmetic
  lands as ink mottle. The cost: per-cell deposit-count noise (±~40%) —
  which means texture _claims_ in tests must be measured as **correlation
  with the sheet on a 3×3-smoothed field**, not raw per-cell variance.

## Performance: the four-layer budget

The bar (from the calligraphy session, and it held): pan/zoom/other tools at
60 fps, live drawing at 60 fps whatever the stroke length, a one-off cost per
mark is fine. Pan and zoom _gestures_ are already met one level up — the frame
cache scrolls a pure pan and carries a zoom in flight as one blit
(`CacheSpec.zooming` in `cache.ts`) — so a simulation only has to be fast at
settled repaints (the dried-mark store) and live drawing (the incremental
walk); never tune a medium for the frames a gesture throws away.

1. **Work the field in document space** (`PITCH = 1` doc px), never screen
   space — the mark is then the same picture at every zoom, which is what
   makes it _cacheable_.
2. **Dried-mark store** (`quillStore.ts`, modelled on the wash's): landed
   marks are simulated once and blitted forever. Identity-keyed asks
   (points array + every input that changes pixels, page colour included),
   _refuse-not-evict_ when full, `WeakRef` sweep of paths the app dropped, a
   turned-away slot because wet marks are asked twice per repaint.
3. **Incremental live walk** (`openScribe`/`advanceScribe`): keep the live
   field between pointer samples; settle a touch permanently once its
   smoothed speed can no longer change (`trace` smooths ±2 raw samples);
   lay the still-moving tail _provisionally_ with an `(cell, amount)` undo
   log and subtract it back next frame; flush only the dirty patch. End
   effects (the lift pool) ride the provisional tail — which is also the
   honest physics: the pool follows the pen and settles at the lift. At the
   lift, **promote** the live field into the store (crop the headroom off)
   instead of re-walking the mark.
4. **Budgets as a backstop**: band-based cell budget (box-based punishes
   diagonals — the lead's lesson), a span cap for the memory of the box, a
   `LEAST` size under which the field falls through.

Profile before optimizing: this session's hotspot was `sheetDip` per cell,
fixed by the physics itself — a charged nib's meniscus **bridges** every dip
shallower than its reach, so once reach clears `sheetRelief(ground)` the sheet
need not be consulted at all. Hoist per-touch constants out of the per-cell
loop, make the loop incremental adds, and LUT the per-cell `Math.pow`
(`quillShade.ts`). Micro-optimizing before measuring would have missed all
of it.

## The grows contract

If the plugin declares `grows: true`, `trail.ts` repaints a gesture only
where it grew — so **nothing about a settled pixel may depend on the path
after it**, ever:

- reservoir/state walks front-to-back; noise is hashed on arc distance;
  start effects read distance from the start.
- end effects must stay within the nib's reach of the newest points (inside
  the trail's `JOIN_SLACK` patch), or live only on the provisional tail.
- **no live-versus-landed coarsening** (the wash's `LIVE_BUDGET` trick is
  unavailable): a coarser live grid re-textures the whole mark as it grows —
  a stale-patch glitch by construction.

`scripts/verify-incremental.ts` checks the whole contract cell-for-cell:
advance a gesture a few points at a time, compare against one full walk,
worst cell diff must be float noise. **Run it after any change to the walk.**

## Always fall back

The engine must be able to say no — no DOM (tests, SSR), a hairline at far
zoom-out, an edge under `LEAST` cells, a gesture past the span cap — and the
old geometric painter catches it, _inside the seam_ (`paintInk`), not at call
sites. Keep the fallback honest about state the simulation carries (the quill
fallback pales with `load`, so a starved stroke doesn't snap solid when the
painter switches). The fallback cases fire at sizes where the medium's
character cannot show, which is what makes falling back invisible.

## Wiring checklist (repo-specific)

- Per-stroke inputs (ink load, pressure) are **dials**; dial defaults must
  equal the painter's own default argument. Strings go in **both** `en.ts`
  and `sv.ts`. `tests/dials_test.ts` names every tool with >2 dials — a new
  axis means joining that list with a reason.
- The painter gets page/ground/live through `PaintDetail` — already threaded;
  a new _setting_ (engine choice, detail slider) needs the full
  `useAppSettings` → `App.tsx` → `PaintCanvas` → `frame.ts` → `cache.ts
sameFrame` → `tiles.ts` chain (see how `leadEngine` travels). A simulation
  that simply _replaces_ the painter needs none of that.
- Files stay under 1000 lines — split by concern (`Field` / `Sim` / `Store` /
  `Shade`), which is the right structure anyway.
- Export the tiny pure functions that _are_ the model (`taking`, `railing`,
  `pooled`, `inkFlow`) and test the claims as numbers; use the fake canvas's
  `putImageData` count as the cost meter for store/promotion tests.

## Scripts

```sh
S=.agent/skills/tool-simulation/scripts
npx vite-node $S/ink-sheet.ts            # the exercise sheet (ink-sheet.png)
npx vite-node $S/zoom.ts -- ink-sheet.png 60 40 300 160 3   # crop at 3x
npx vite-node $S/probe-ink.ts            # film numbers + timings
npx vite-node $S/verify-incremental.ts   # live walk == one-shot walk
```

…and the same three for the paintbrush, which are the worked examples for a
medium whose character is a _shape_ rather than a flow:

```sh
npx vite-node $S/brush-sheet.ts          # taps, drags, a press that jittered,
                                         # the dry preset, a flat to compare
npx vite-node $S/brush-probe.ts          # band width vs the ferrule, comb
                                         # contrast, what a print/frame costs
npx vite-node $S/brush-shot.ts           # ONE stroke, big, shaped like the
                                         # reference photograph, in its colour
```

All node-only (`pngio.ts` writes/reads PNGs with `zlib`); nothing to install.
Copy the nearest pair, swap the imports, and rewrite the rows/windows for the
medium you are simulating. `brush-shot.ts` is worth copying for any medium you
have a photograph of: one mark at the size and colour of the reference, so the
render and the photograph can be held side by side rather than compared against
a memory of one.
