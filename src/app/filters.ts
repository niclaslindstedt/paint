// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Filters: how the page is *looked at*, rather than what is on it.
//
// A drawing is a stroke list and stays one. A filter adds no marks and edits
// none — it is a number (or two) on the drawing saying how the finished picture
// is composited when it is painted, and the painting is `filterPaint.ts`'s job
// on a canvas and `svgFilter` below's in an SVG. Switching one off restores the
// page exactly, because nothing was ever taken away.
//
// That is the whole reason filters live on the document rather than being
// "applied" to it. The obvious implementation — rasterise the page, blur the
// pixels, put a picture back in place of the marks — would trade the property
// the rest of this app is built around (undo is exact, the document is small,
// a synced copy is readable JSON) for one that is easier to write.
//
// This module is pure and DOM-free: what the filters *are*, what they offer to
// set, and how a list of them is kept. Two rules the rest of the app leans on:
//
//   - **At most one of each kind.** Blur is a setting on the page, not
//     something you stack; a second blur is the first one moved.
//   - **A fixed order.** `FILTERS` declares it — blur, then noise, so the grain
//     sits on top of the softened picture rather than being smeared by it — and
//     a drawing's filters are always read back in that order however they were
//     switched on.
//
// Nothing outside here knows a filter by name. The descriptors say what each
// one offers, the panel renders the list, and the dialog renders the controls —
// the same shape the tool plugins' dials use, and for the same reason: adding a
// filter should be a descriptor and two catalog strings, not a new dialog.

import type { TKey } from "./i18n/index.ts";
import type { Drawing, Filter } from "./types.ts";

export type FilterKind = Filter["kind"];

/** One numeric option on a filter — a slider in the dialog, keyed by the field
 *  it writes on the filter itself. */
export type FilterControl = {
  /** The field this slider sets. Persisted (it *is* a field of `Filter`), so
   *  renaming one forgets that setting. */
  id: string;
  /** Catalog key for the label, interpolated with `{value}`. The unit belongs
   *  in the string, as it does for a tool dial. */
  nameKey: TKey;
  min: number;
  max: number;
  step: number;
  /** How the number reads: a real distance on the page, or a fraction of full
   *  strength shown as a percentage. */
  unit: "px" | "percent";
};

/** One on/off option — a toggle in the dialog. */
export type FilterSwitch = {
  id: string;
  nameKey: TKey;
  hintKey: TKey;
};

/** What one filter is: what it is called, what it offers to set, and how it
 *  arrives when it is first switched on. */
export type FilterDescriptor = {
  kind: FilterKind;
  nameKey: TKey;
  hintKey: TKey;
  controls: readonly FilterControl[];
  switches: readonly FilterSwitch[];
  /** The control whose value stands for the filter on the panel's row — the one
   *  that says how much of it there is. */
  readout: string;
  /** The filter as it arrives, which is deliberately a *visible* setting: a
   *  filter switched on that changes nothing reads as a filter that is broken. */
  preset: Filter;
};

/** How soft a blur may be asked to be, in document pixels. Past this the page
 *  is a fog rather than a picture, and every pixel of it costs. */
export const MAX_BLUR = 48;

/** How big one speck of grain may be. Past a few pixels it stops reading as
 *  noise and starts reading as a pattern. */
export const MAX_GRAIN = 8;

/** What the grain's strength slider means at the top of its travel.
 *
 *  Every pixel of the page gets a speck, so raw alpha reads far heavier than
 *  the number suggests — at full opacity the drawing disappears under the dust.
 *  This is the ceiling that makes the slider's whole range worth having: 100% is
 *  heavy grain, not a snowstorm. Shared by both painters, so a file grains as
 *  hard as the screen did. */
export const GRAIN_CEILING = 0.45;

/** The filters, in the order they are applied. */
export const FILTERS: readonly FilterDescriptor[] = [
  {
    kind: "blur",
    nameKey: "filters.blur.name",
    hintKey: "filters.blur.hint",
    readout: "radius",
    controls: [
      {
        id: "radius",
        nameKey: "filters.blur.radius",
        min: 1,
        max: MAX_BLUR,
        step: 1,
        unit: "px",
      },
    ],
    switches: [],
    preset: { kind: "blur", radius: 6 },
  },
  {
    kind: "noise",
    nameKey: "filters.noise.name",
    hintKey: "filters.noise.hint",
    readout: "amount",
    controls: [
      {
        id: "amount",
        nameKey: "filters.noise.amount",
        min: 0.05,
        max: 1,
        step: 0.05,
        unit: "percent",
      },
      {
        id: "grain",
        nameKey: "filters.noise.grain",
        min: 1,
        max: MAX_GRAIN,
        step: 1,
        unit: "px",
      },
    ],
    switches: [
      {
        id: "color",
        nameKey: "filters.noise.color",
        hintKey: "filters.noise.colorHint",
      },
    ],
    preset: { kind: "noise", amount: 0.35, grain: 2 },
  },
];

/** What one kind offers. Every kind in the model has a descriptor, so this only
 *  answers `undefined` for a string that is not a filter at all. */
export function filterDescriptor(kind: string): FilterDescriptor | undefined {
  return FILTERS.find((f) => f.kind === kind);
}

/** Any list of filters, in the order they are applied and with anything this
 *  build doesn't recognise (a document written by a newer one) left out.
 *
 *  The one place that order is decided, so a drawing's filters and a layer's
 *  come out of it the same way — a page and a sheet of it must not soften and
 *  grain in opposite orders. */
export function orderedFilters(
  filters: readonly Filter[] | undefined,
): Filter[] {
  const held = filters ?? [];
  return FILTERS.map((descriptor) =>
    held.find((filter) => filter.kind === descriptor.kind),
  ).filter((filter): filter is Filter => filter !== undefined);
}

/** A drawing's page-wide filters, in the order they are applied. */
export function activeFilters(drawing: Drawing): Filter[] {
  return orderedFilters(drawing.filters);
}

/** What a filter dialog is currently being opened *for*: which filter, and
 *  whether it belongs to the page or to one sheet of the stack.
 *
 *  One dialog serves both — the controls are the descriptor's either way, and a
 *  second dialog that rendered the same sliders against a different owner is
 *  exactly the duplication the descriptors exist to avoid. `layerId` absent
 *  means the page. */
export type FilterTarget = { kind: FilterKind; layerId?: string };

/** How far past its standard deviation a Gaussian is worth sampling. Three is
 *  where it falls under a thousandth and stops being visible. */
export const BLUR_TAIL = 3;

/** How far these filters can move ink, in document pixels.
 *
 *  Zero for everything but a blur: grain lands on the pixel it is over, and
 *  every other effect this app has is local. A blur is not, and the number
 *  matters wherever painting is *culled* — a mark a hair off the left of the
 *  window still fogs its way in, so a repaint that skipped it because it was
 *  out of frame would leave the edge of a blurred layer visibly lighter than
 *  the middle. Callers pad their clip by this (see `render.ts`). */
export function filterReach(filters: readonly Filter[]): number {
  let reach = 0;
  for (const filter of filters) {
    if (filter.kind === "blur") {
      reach = Math.max(reach, filter.radius * BLUR_TAIL);
    }
  }
  return reach;
}

/** The drawing's page-wide filter of this kind, or `undefined` when it is
 *  switched off. */
export function filterOf(
  drawing: Drawing,
  kind: FilterKind,
): Filter | undefined {
  return drawing.filters?.find((filter) => filter.kind === kind);
}

/** One layer's filter of this kind, or `undefined` when that layer isn't
 *  carrying one (or isn't in the stack at all — a row that has just been
 *  deleted out from under an open dialog). */
export function layerFilterOf(
  drawing: Drawing,
  layerId: string,
  kind: FilterKind,
): Filter | undefined {
  const layer = drawing.layers?.find((candidate) => candidate.id === layerId);
  return layer?.filters?.find((filter) => filter.kind === kind);
}

/** Switch `filter` on (or move it), keeping one of each kind and the declared
 *  order. */
export function withFilter(
  filters: readonly Filter[] | undefined,
  filter: Filter,
): Filter[] {
  const rest = (filters ?? []).filter((held) => held.kind !== filter.kind);
  return order([...rest, filter]);
}

/** Switch a kind off. Hands back `undefined` rather than an empty array when
 *  nothing is left, so a page with no filters carries no field at all — the
 *  document it was before anyone opened this panel. */
export function withoutFilter(
  filters: readonly Filter[] | undefined,
  kind: FilterKind,
): Filter[] | undefined {
  const rest = (filters ?? []).filter((filter) => filter.kind !== kind);
  return rest.length > 0 ? order(rest) : undefined;
}

function order(filters: readonly Filter[]): Filter[] {
  return orderedFilters(filters);
}

/** Read one option off a filter by id. A filter is a flat record of primitives
 *  by construction (see `Filter`), which is what lets the dialog render a
 *  descriptor's controls without knowing which filter it is looking at. */
export function controlValue(filter: Filter, id: string): number {
  const value = (filter as unknown as Record<string, unknown>)[id];
  return typeof value === "number" ? value : 0;
}

/** Move one option. */
export function withControl(filter: Filter, id: string, value: number): Filter {
  return { ...filter, [id]: value } as Filter;
}

export function switchValue(filter: Filter, id: string): boolean {
  return (filter as unknown as Record<string, unknown>)[id] === true;
}

/** Flip one switch. Switching it *off* drops the field rather than writing
 *  `false`: an absent flag is the default everywhere else in this document, and
 *  a filter should serialise to what it started as when it is set back. */
export function withSwitch(filter: Filter, id: string, on: boolean): Filter {
  const next = { ...filter } as unknown as Record<string, unknown>;
  if (on) next[id] = true;
  else delete next[id];
  return next as unknown as Filter;
}

/** How one slider's number reads: a strength as a whole percentage, a distance
 *  as whole document pixels. What the catalog string's `{value}` is filled
 *  with, exactly as a tool dial's is. */
export function controlReadout(control: FilterControl, value: number): number {
  return control.unit === "percent"
    ? Math.round(value * 100)
    : Math.round(value);
}

/** How a filter reads on the panel's row: the number that says how much of it
 *  there is, with its unit. Not a catalog string — "px" and "%" are symbols,
 *  and the row has space for a number and nothing else. */
export function filterReadout(filter: Filter): string {
  const descriptor = filterDescriptor(filter.kind);
  const control = descriptor?.controls.find((c) => c.id === descriptor.readout);
  if (!control) return "";
  const value = controlValue(filter, control.id);
  return control.unit === "percent"
    ? `${Math.round(value * 100)}%`
    : `${Math.round(value)} px`;
}

/** Keep a filter's page distances in proportion when the whole drawing is
 *  scaled (see `transform.ts`). A blur is a distance on the page exactly as a
 *  nib width is: scale the sheet up and leave the radius alone, and a drawing
 *  that was softly blurred comes back nearly sharp.
 *
 *  Only the `px` options move; a strength is a fraction and means the same at
 *  any size. Values are clamped to what the dialog can offer, so a page scaled
 *  ten times still holds a filter its own controls can put back. */
export function scaleFilters(
  filters: readonly Filter[] | undefined,
  scale: number,
): Filter[] | undefined {
  if (!filters || filters.length === 0) return undefined;
  if (!Number.isFinite(scale) || scale <= 0 || scale === 1) {
    return [...filters];
  }
  return filters.map((filter) => {
    const descriptor = filterDescriptor(filter.kind);
    if (!descriptor) return filter;
    let next = filter;
    for (const control of descriptor.controls) {
      if (control.unit !== "px") continue;
      const scaled = controlValue(filter, control.id) * scale;
      next = withControl(
        next,
        control.id,
        Math.min(control.max, Math.max(control.min, Math.round(scaled))),
      );
    }
    return next;
  });
}

// --- The SVG half -----------------------------------------------------------
//
// The raster exports go through the same canvas code the screen does, so what
// lands in a PNG is what was on screen. An SVG has no pixels to composite, but
// it does have filter primitives — so the same two effects are emitted as a
// `<filter>` and the recorded drawing is wrapped in it (see `svg.ts`).
//
// The blur is exact: CSS/canvas `blur(r)` and `feGaussianBlur stdDeviation="r"`
// are the same Gaussian. The grain is not — an SVG has no way to carry the
// speck tile the canvas paints, and `feTurbulence` is the nearest thing a
// reader can generate for itself. It is the same effect at the same strength
// and the same scale, speck for speck it is different noise.

/** The `<filter>` an SVG export wraps the drawing in, or `null` for a drawing
 *  with no filters on it. */
export function svgFilter(
  filters: readonly Filter[],
  id = "page-filter",
): { id: string; markup: string } | null {
  if (filters.length === 0) return null;
  const primitives: string[] = [];
  let source = "SourceGraphic";
  let step = 0;
  for (const filter of filters) {
    step += 1;
    const out = `f${step}`;
    if (filter.kind === "blur") {
      primitives.push(
        `<feGaussianBlur in="${source}" stdDeviation="${round(filter.radius)}" result="${out}"/>`,
      );
    } else {
      // One speck is `grain` document pixels across, so the turbulence that
      // stands in for the speck tile runs at one cycle per speck.
      const frequency = round(1 / Math.max(1, filter.grain));
      const strength = round(filter.amount * GRAIN_CEILING);
      primitives.push(
        `<feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="1" seed="1" result="${out}n"/>`,
      );
      if (filter.color) {
        // Coloured grain: the turbulence's own colours, showing where its own
        // alpha is above the middle so half the specks are nothing at all.
        primitives.push(
          matrix(
            `${out}n`,
            `${out}g`,
            "1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 -0.5",
            strength,
          ),
          `<feComposite in="${out}g" in2="${source}" operator="atop" result="${out}"/>`,
        );
      } else {
        // Monochrome grain is two coats, and it has to be: a canvas speck is
        // either lighter or darker than what it lands on, and one grey veil
        // over the page would only wash it out. The turbulence's red channel
        // decides which — above the middle it darkens, below it lightens — so
        // the two coats never fall on the same pixel.
        primitives.push(
          matrix(
            `${out}n`,
            `${out}d`,
            "0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 -0.5",
            strength,
          ),
          matrix(
            `${out}n`,
            `${out}l`,
            "0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -1 0 0 0 0.5",
            strength,
          ),
          `<feComposite in="${out}d" in2="${source}" operator="atop" result="${out}s"/>`,
          `<feComposite in="${out}l" in2="${out}s" operator="atop" result="${out}"/>`,
        );
      }
    }
    source = out;
  }
  return {
    id,
    // sRGB rather than the default linear light: the canvas composites in sRGB,
    // and a file that blurs and grains in linear light is a visibly different
    // picture from the one that was on screen.
    markup:
      `<filter id="${id}" color-interpolation-filters="sRGB">` +
      `${primitives.join("")}</filter>`,
  };
}

/** One channel remap, with the grain's strength applied to whatever alpha it
 *  produced. */
function matrix(
  input: string,
  output: string,
  values: string,
  strength: string,
): string {
  return (
    `<feColorMatrix in="${input}" type="matrix" values="${values}" result="${output}x"/>` +
    `<feComponentTransfer in="${output}x" result="${output}">` +
    `<feFuncA type="linear" slope="${strength}" intercept="0"/>` +
    `</feComponentTransfer>`
  );
}

function round(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
