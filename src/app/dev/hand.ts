// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A hand, for the presentation demo (`demoData.ts`): the marks a person makes
// when they sketch a box, an arrow or a circle, as the pointer samples the
// app's own freehand tools record.
//
// A program drawing a box draws four perfect edges. A person draws a slightly
// bowed top, rounds the corner without meaning to, lets the last side run past
// where it started, and the pen is slow where it lands and lifts and fast in
// between. That last part matters to more than the look: the simulated media
// read speed off the gaps between samples (the broad nib shades with it, a
// wash spends its water along it), so a mark sampled at an even step would
// paint as a machine's in every one of them. So every stroke here is a *guide*
// (the path the hand means) traced the way a hand moves along it:
//
//   - a minimum-jerk speed profile (the bell-shaped velocity of a practised
//     reach), sampled at a pointer's ~120 Hz, so samples crowd at the ends and
//     spread out in the middle;
//   - a slow wander across the path, a few document pixels over a stroke's
//     length, and a finer tremor on top;
//   - the app's own minimum sample distance (`MIN_SAMPLE_DISTANCE` in
//     `plugins/builtin/freehand.ts`), so the points are the ones the tool would
//     have kept.
//
// Deterministic by construction: every random number comes from a seeded
// generator, so the same drawing is the same strokes on every boot, in every
// screenshot and in the tests.

export type Pt = { x: number; y: number };

/** The freehand tools' minimum sample distance, in document pixels. */
const MIN_STEP = 1.5;

/** mulberry32 — small, fast, and plenty for jitter. */
function generator(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const mul = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
const len = (a: Pt): number => Math.hypot(a.x, a.y);
const unit = (a: Pt): Pt => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
const normal = (a: Pt): Pt => ({ x: -a.y, y: a.x });
const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const rotate = (a: Pt, angle: number): Pt => ({
  x: a.x * Math.cos(angle) - a.y * Math.sin(angle),
  y: a.x * Math.sin(angle) + a.y * Math.cos(angle),
});

/** Points along a quadratic Bézier, about every `step` pixels. */
function quad(a: Pt, c: Pt, b: Pt, step = 2): Pt[] {
  const est = len(sub(c, a)) + len(sub(b, c));
  const n = Math.max(2, Math.ceil(est / step));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    });
  }
  return out;
}

/** Points along a cubic Bézier, about every `step` pixels. */
export function cubic(a: Pt, c1: Pt, c2: Pt, b: Pt, step = 2): Pt[] {
  const est = len(sub(c1, a)) + len(sub(c2, c1)) + len(sub(b, c2));
  const n = Math.max(2, Math.ceil(est / step));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push({
      x:
        u * u * u * a.x +
        3 * u * u * t * c1.x +
        3 * u * t * t * c2.x +
        t * t * t * b.x,
      y:
        u * u * u * a.y +
        3 * u * u * t * c1.y +
        3 * u * t * t * c2.y +
        t * t * t * b.y,
    });
  }
  return out;
}

/** Join guide pieces, dropping the repeated point at each seam. */
function join(...pieces: Pt[][]): Pt[] {
  const out: Pt[] = [];
  for (const piece of pieces) {
    for (const p of piece) {
      const last = out[out.length - 1];
      if (last && len(sub(last, p)) < 0.01) continue;
      out.push(p);
    }
  }
  return out;
}

export type TraceOptions = {
  /** Peak hand speed, document pixels a second (~18 px is a millimetre). */
  speed?: number;
  /** How far the stroke wanders off its guide, in document pixels. */
  wander?: number;
};

export type BoxOptions = {
  /** Corner radius the hand rounds off, in document pixels. */
  corner?: number;
  /** One continuous stroke (the default) or two L-shaped ones. */
  strokes?: 1 | 2;
  speed?: number;
};

export type ArrowOptions = {
  /** Bow of the shaft, as a fraction of its length (signed). */
  bow?: number;
  /** Length of each wing of the head, in document pixels. */
  head?: number;
  /** The shaft as a cubic curve through these two controls instead. */
  via?: [Pt, Pt];
  speed?: number;
};

/**
 * A seeded hand. Each drawing gets its own, so changing one drawing never
 * reshuffles another's strokes.
 */
export class Hand {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = generator(seed);
  }

  /** A uniform number in [a, b). */
  r(a = 0, b = 1): number {
    return a + (b - a) * this.next();
  }

  /** ±`k`, uniformly. */
  j(k: number): number {
    return this.r(-k, k);
  }

  /** A point nudged by up to `k` pixels each way. */
  nudge(p: Pt, k: number): Pt {
    return { x: p.x + this.j(k), y: p.y + this.j(k) };
  }

  /** A smooth wander in [-1, 1] along a length: random knots every `step`
   *  pixels, eased between. */
  private wave(length: number, step: number): (s: number) => number {
    const knots = Array.from({ length: Math.ceil(length / step) + 2 }, () =>
      this.r(-1, 1),
    );
    return (s: number) => {
      const f = Math.max(0, s) / step;
      const i = Math.floor(f);
      const t = f - i;
      const e = t * t * (3 - 2 * t);
      const a = knots[Math.min(i, knots.length - 1)]!;
      const b = knots[Math.min(i + 1, knots.length - 1)]!;
      return a + (b - a) * e;
    };
  }

  /**
   * Trace a guide the way a hand does: minimum-jerk timing sampled at a
   * pointer's rate, a slow wander across the path and a fine tremor.
   */
  trace(guide: Pt[], o: TraceOptions = {}): Pt[] {
    if (guide.length < 2) return guide.map((p) => ({ ...p }));
    const cum = [0];
    for (let i = 1; i < guide.length; i++) {
      cum.push(cum[i - 1]! + len(sub(guide[i]!, guide[i - 1]!)));
    }
    const total = cum[cum.length - 1]!;
    const at = (s: number): { p: Pt; n: Pt } => {
      let lo = 0;
      let hi = cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid]! <= s) lo = mid;
        else hi = mid;
      }
      const span = cum[hi]! - cum[lo]! || 1;
      const t = Math.min(1, Math.max(0, (s - cum[lo]!) / span));
      const d = sub(guide[hi]!, guide[lo]!);
      return { p: lerp(guide[lo]!, guide[hi]!, t), n: normal(unit(d)) };
    };
    const wander = o.wander ?? Math.min(4, Math.max(0.8, total * 0.004));
    const slow = this.wave(total, Math.max(60, total / 3));
    const fine = this.wave(total, 9);
    // A practised reach: peak speed is 1.875 × the mean for minimum jerk.
    const peak = (o.speed ?? 1500) * this.r(0.85, 1.15);
    const duration = Math.max(0.09, (1.875 * total) / peak);
    const out: Pt[] = [];
    let time = 0;
    for (;;) {
      const tau = Math.min(1, time / duration);
      const s = total * (10 * tau ** 3 - 15 * tau ** 4 + 6 * tau ** 5);
      const { p, n } = at(s);
      const off = wander * slow(s) + 0.35 * fine(s);
      const q = add(p, mul(n, off));
      const last = out[out.length - 1];
      const kept = {
        x: Math.round(q.x * 10) / 10,
        y: Math.round(q.y * 10) / 10,
      };
      if (!last || len(sub(kept, last)) >= MIN_STEP) out.push(kept);
      else if (tau >= 1) {
        // The lift lands where the pen stopped, not a sample short of it —
        // and, as the tool would, never nearer a kept sample than the floor:
        // the ones just before it give way instead.
        while (
          out.length > 1 &&
          len(sub(kept, out[out.length - 1]!)) < MIN_STEP
        ) {
          out.pop();
        }
        out.push(kept);
      }
      if (tau >= 1) break;
      time += (1 / 120) * this.r(0.9, 1.1);
    }
    return out;
  }

  /** The guide of a slightly bowed straight run. */
  bowed(a: Pt, b: Pt, bow: number): Pt[] {
    const mid = lerp(a, b, 0.5);
    const c = add(mid, mul(normal(unit(sub(b, a))), bow * len(sub(b, a))));
    return quad(a, c, b);
  }

  /** A straight line, as a hand draws one: a touch bowed, the ends not quite
   *  where they were aimed. */
  line(a: Pt, b: Pt, o: TraceOptions & { bow?: number } = {}): Pt[] {
    const bow = o.bow ?? this.j(0.012);
    return this.trace(this.bowed(this.nudge(a, 2), this.nudge(b, 2), bow), o);
  }

  /** A polyline guide whose corners the hand rounds, with each edge bowed. */
  private cornered(points: Pt[], radius: number): Pt[] {
    const pieces: Pt[][] = [];
    let from = points[0]!;
    for (let i = 1; i < points.length; i++) {
      const v = points[i]!;
      const last = i === points.length - 1;
      const into = unit(sub(v, points[i - 1]!));
      const edge = len(sub(v, from));
      const r = last ? 0 : Math.min(radius * this.r(0.6, 1.4), edge * 0.3);
      const end = sub(v, mul(into, r));
      pieces.push(this.bowed(from, end, this.j(0.01)));
      if (!last) {
        const out = unit(sub(points[i + 1]!, v));
        const next = add(v, mul(out, r));
        pieces.push(quad(end, v, next));
        from = next;
      }
    }
    return join(...pieces);
  }

  /**
   * A box, the way a person sketches one: one continuous stroke from near the
   * top-left, round the corners and on past where it started — or two
   * L-shaped strokes, the left-and-bottom then the top-and-right.
   */
  box(x: number, y: number, w: number, h: number, o: BoxOptions = {}): Pt[][] {
    const corner = o.corner ?? Math.min(w, h) * 0.05;
    const k = Math.min(w, h) * 0.015 + 1.5;
    const tl = this.nudge({ x, y }, k);
    const tr = this.nudge({ x: x + w, y }, k);
    const br = this.nudge({ x: x + w, y: y + h }, k);
    const bl = this.nudge({ x, y: y + h }, k);
    const trace = { speed: o.speed ?? 1700 };
    if ((o.strokes ?? 1) === 2) {
      const first = [
        add(tl, { x: this.j(3), y: -this.r(2, 8) }),
        bl,
        add(br, { x: this.r(6, 18), y: this.j(3) }),
      ];
      const second = [
        add(tl, { x: -this.r(4, 12), y: this.j(3) }),
        tr,
        add(br, { x: this.j(3), y: this.r(4, 14) }),
      ];
      return [
        this.trace(this.cornered(first, corner), trace),
        this.trace(this.cornered(second, corner), trace),
      ];
    }
    const start = lerp(tl, tr, this.r(0.04, 0.12));
    const overrun = lerp(tl, tr, this.r(0.12, 0.22));
    const lift = add(overrun, { x: 0, y: this.j(4) });
    return [
      this.trace(this.cornered([start, tr, br, bl, tl, lift], corner), trace),
    ];
  }

  /**
   * A loop round something — the circle drawn to point at a thing. It runs a
   * little past a full turn, drifts inwards as it goes, and is never quite
   * the ellipse that was meant.
   */
  loop(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    o: TraceOptions & { turns?: number; tilt?: number; start?: number } = {},
  ): Pt[] {
    const turns = o.turns ?? this.r(1.08, 1.18);
    const tilt = o.tilt ?? this.j(0.12);
    const start = o.start ?? -Math.PI / 2 + this.j(0.6);
    const sweep = Math.PI * 2 * turns;
    const circumference = Math.PI * (rx + ry);
    const n = Math.max(24, Math.ceil((circumference * turns) / 2));
    const lump = this.wave(n, n / 5);
    const guide: Pt[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      // Anticlockwise on screen, the way most hands go round.
      const a = start - sweep * t;
      const f = 1 + 0.035 * lump(i) - 0.045 * t;
      const p = rotate(
        { x: Math.cos(a) * rx * f, y: Math.sin(a) * ry * f },
        tilt,
      );
      guide.push({ x: cx + p.x, y: cy + p.y });
    }
    return this.trace(guide, { speed: o.speed ?? 2200, wander: o.wander ?? 1 });
  }

  /**
   * An arrow: the shaft, then the head as one stroke — out along one wing,
   * into the tip, back along the other — never quite symmetrical.
   */
  arrow(a: Pt, b: Pt, o: ArrowOptions = {}): Pt[][] {
    const from = this.nudge(a, 2);
    const to = this.nudge(b, 2);
    const guide = o.via
      ? cubic(from, o.via[0], o.via[1], to)
      : this.bowed(from, to, o.bow ?? this.j(0.015));
    const shaft = this.trace(guide, { speed: o.speed ?? 1800 });
    const tip = shaft[shaft.length - 1]!;
    const back = shaft[Math.max(0, shaft.length - 6)]!;
    const dir = unit(sub(tip, back));
    const head =
      (o.head ?? Math.min(46, len(sub(to, from)) * 0.22)) * this.r(0.9, 1.1);
    const wing = (side: number) =>
      add(
        tip,
        mul(
          rotate(mul(dir, -1), side * (0.5 + this.j(0.08))),
          head * this.r(0.85, 1.1),
        ),
      );
    const w1 = wing(1);
    const w2 = wing(-1);
    const nib = add(tip, mul(dir, this.r(0, 3)));
    const headGuide = join(
      quad(w1, lerp(w1, nib, 0.7), nib, 1.5),
      quad(nib, lerp(nib, w2, 0.3), w2, 1.5),
    );
    return [shaft, this.trace(headGuide, { speed: 1100, wander: 0.6 })];
  }

  /** A dashed line: short strokes, the gaps never quite even. */
  dashes(a: Pt, b: Pt, dash = 26, gap = 18): Pt[][] {
    const total = len(sub(b, a));
    const dir = unit(sub(b, a));
    const out: Pt[][] = [];
    let s = this.r(0, gap);
    while (s < total - 4) {
      const d = Math.min(dash * this.r(0.75, 1.2), total - s);
      const p = add(a, mul(dir, s));
      const q = add(a, mul(dir, s + d));
      out.push(
        this.trace(
          this.bowed(this.nudge(p, 1.2), this.nudge(q, 1.2), this.j(0.03)),
          { speed: 700, wander: 0.4 },
        ),
      );
      s += d + gap * this.r(0.8, 1.25);
    }
    return out;
  }

  /**
   * Shading, the way a pencil does it fast: one stroke zig-zagging across an
   * area at an angle, each pass a little off the last. `spacing` is between
   * passes; the area is a rectangle the passes are clipped to.
   */
  zigzag(
    x: number,
    y: number,
    w: number,
    h: number,
    spacing: number,
    angle = -0.9,
    speed = 2400,
    within?: (p: Pt) => boolean,
  ): Pt[] {
    // Work in a frame turned by `angle`: passes run along u, step along v.
    const c = { x: x + w / 2, y: y + h / 2 };
    const reach = Math.hypot(w, h) / 2;
    const toWorld = (u: number, v: number): Pt =>
      add(c, rotate({ x: u, y: v }, angle));
    const inside = (p: Pt) =>
      p.x >= x &&
      p.x <= x + w &&
      p.y >= y &&
      p.y <= y + h &&
      (!within || within(p));
    const guide: Pt[] = [];
    let flip = false;
    for (let v = -reach; v <= reach; v += spacing * this.r(0.8, 1.2)) {
      const run: Pt[] = [];
      for (let u = -reach; u <= reach; u += 3) {
        const p = toWorld(u, v + this.j(0.8));
        if (inside(p)) run.push(p);
      }
      if (run.length < 2) continue;
      // The turn overshoots or falls short of the edge by a little.
      const trim = Math.floor(run.length * this.r(0, 0.06));
      const kept = run.slice(
        trim,
        run.length - Math.floor(run.length * this.r(0, 0.06)),
      );
      guide.push(...(flip ? kept.reverse() : kept));
      flip = !flip;
    }
    return this.trace(guide, { speed, wander: 1.5 });
  }

  /** A freehand curve through `points` (Catmull–Rom), traced. */
  curve(points: Pt[], o: TraceOptions = {}): Pt[] {
    const guide: Pt[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(0, i - 1)]!;
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      const p3 = points[Math.min(points.length - 1, i + 2)]!;
      const c1 = add(p1, mul(sub(p2, p0), 1 / 6));
      const c2 = sub(p2, mul(sub(p3, p1), 1 / 6));
      guide.push(...cubic(p1, c1, c2, p2));
    }
    return this.trace(join(guide), o);
  }
}
