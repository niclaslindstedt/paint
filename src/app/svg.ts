// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The SVG export, written as a *recording canvas* rather than a second
// renderer.
//
// The app's rule is that there is one painting path: a stroke is painted by the
// plugin that drew it, and the screen, the PNG, and the JPG all go through
// `renderDrawing`. An SVG exporter that walked the strokes itself would be a
// second painter to keep in step — and every new tool would have to be taught
// to it, which is exactly the coupling the plugin seam exists to avoid.
//
// So instead of a new painter this is a new *context*: an object with the slice
// of the 2D canvas API the painters use, which records what it is asked to draw
// and emits the equivalent SVG. `renderDrawing` paints into it exactly as it
// paints into a real canvas, and a tool that draws through `ink.ts` or
// `brushes.ts` gets vector output for free.
//
// The slice is spelled out rather than left implicit (see `SvgCanvas`), and it
// is the whole contract: a painter that reaches for a 2D call this doesn't
// carry is a painter whose marks would go missing from an SVG, which is worth
// finding here rather than in a file.

/** The painting state a recorded call is emitted with. Saved and restored as a
 *  unit, exactly as a real context's is — the translation included, because the
 *  brushes stamp their dabs by translating rather than by moving the shape. */
type PaintedState = {
  fillStyle: string | SvgGradient;
  strokeStyle: string;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  font: string;
  tx: number;
  ty: number;
};

const INITIAL: Omit<PaintedState, "tx" | "ty"> = {
  fillStyle: "#000000",
  strokeStyle: "#000000",
  lineWidth: 1,
  lineCap: "butt",
  lineJoin: "miter",
  globalAlpha: 1,
  font: "10px sans-serif",
};

/** Two decimals is finer than any screen and keeps the file readable. */
function n(value: number): string {
  return Number.isFinite(value)
    ? String(Math.round(value * 100) / 100)
    : /* c8 ignore next */ "0";
}

/** Escape a value for an XML attribute or a text node. Colours and captions
 *  come out of the document, which is user data — an unescaped `&` there would
 *  produce a file no SVG reader will open. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * What `createRadialGradient` hands back: a paint the recorder can turn into a
 * `<radialGradient>` def.
 *
 * The airbrush is the one tool that uses one, and it uses it in a single shape:
 * a cone centred on the dab it fills, running from the middle to the rim. That
 * is why the emitted gradient can use `objectBoundingBox` units — for a circle
 * whose centre and radius are the gradient's own, "the middle of the box" and
 * "half the box" are exactly the right numbers, and one def then serves every
 * dab of the stroke rather than one def per dab.
 */
class SvgGradient {
  readonly stops: { offset: number; color: string }[] = [];
  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

/**
 * A 2D context that writes SVG.
 *
 * Deliberately *only* the subset the painters use: paths, rectangles, ellipses,
 * text, images, radial-gradient fills, a translation, and the ink properties
 * `applyInk` sets. Calls it has no meaning for (`clearRect` — an SVG starts
 * transparent; `clip` — used only by the screen's grid, which never exports)
 * are accepted and ignored, so a caller can hand it to the shared renderer
 * unchanged.
 */
export class SvgCanvas {
  private elements: string[] = [];
  private defs: string[] = [];
  private gradients = new Map<SvgGradient, string>();
  private stack: PaintedState[] = [];
  private path: string[] = [];
  private tx = 0;
  private ty = 0;

  // --- The properties the painters write -----------------------------------
  fillStyle: string | CanvasGradient | CanvasPattern =
    INITIAL.fillStyle as string;
  strokeStyle: string | CanvasGradient | CanvasPattern = INITIAL.strokeStyle;
  lineWidth = INITIAL.lineWidth;
  lineCap: CanvasLineCap = INITIAL.lineCap;
  lineJoin: CanvasLineJoin = INITIAL.lineJoin;
  globalAlpha = INITIAL.globalAlpha;
  font = INITIAL.font;

  save(): void {
    this.stack.push({
      fillStyle: this.fillStyle as string | SvgGradient,
      strokeStyle:
        typeof this.strokeStyle === "string" ? this.strokeStyle : "#000",
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      globalAlpha: this.globalAlpha,
      font: this.font,
      tx: this.tx,
      ty: this.ty,
    });
  }

  restore(): void {
    const prev = this.stack.pop();
    if (!prev) return;
    this.fillStyle = prev.fillStyle as string | CanvasGradient;
    this.strokeStyle = prev.strokeStyle;
    this.lineWidth = prev.lineWidth;
    this.lineCap = prev.lineCap;
    this.lineJoin = prev.lineJoin;
    this.globalAlpha = prev.globalAlpha;
    this.font = prev.font;
    this.tx = prev.tx;
    this.ty = prev.ty;
  }

  /** Shift the origin. Applied as the geometry is recorded, which is where a
   *  real context applies it too: a path holds points in user space. */
  translate(x: number, y: number): void {
    this.tx += x;
    this.ty += y;
  }

  // --- Path building --------------------------------------------------------

  beginPath(): void {
    this.path = [];
  }

  moveTo(x: number, y: number): void {
    this.path.push(`M${n(x + this.tx)} ${n(y + this.ty)}`);
  }

  lineTo(x: number, y: number): void {
    // A `lineTo` with no subpath started behaves as a move on a real context.
    if (this.path.length === 0) this.moveTo(x, y);
    else this.path.push(`L${n(x + this.tx)} ${n(y + this.ty)}`);
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.path.push(
      `Q${n(cx + this.tx)} ${n(cy + this.ty)} ${n(x + this.tx)} ${n(y + this.ty)}`,
    );
  }

  closePath(): void {
    this.path.push("Z");
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.path.push(
      `M${n(x + this.tx)} ${n(y + this.ty)}h${n(width)}v${n(height)}h${n(-width)}Z`,
    );
  }

  /** Only ever called for a full circle (a freehand dot, a spray dab), so the
   *  sweep is written as two half arcs rather than resolving the angles. */
  arc(x: number, y: number, radius: number): void {
    this.ellipse(x, y, radius, radius);
  }

  /** Likewise a full ellipse — the shape tools paint no partial ones. */
  ellipse(x: number, y: number, radiusX: number, radiusY: number): void {
    const cx = x + this.tx;
    const cy = y + this.ty;
    this.path.push(
      `M${n(cx - radiusX)} ${n(cy)}` +
        `A${n(radiusX)} ${n(radiusY)} 0 1 0 ${n(cx + radiusX)} ${n(cy)}` +
        `A${n(radiusX)} ${n(radiusY)} 0 1 0 ${n(cx - radiusX)} ${n(cy)}Z`,
    );
  }

  // --- Paints ---------------------------------------------------------------

  createRadialGradient(
    _x0: number,
    _y0: number,
    _r0: number,
    _x1: number,
    _y1: number,
    _radius: number,
  ): CanvasGradient {
    return new SvgGradient() as unknown as CanvasGradient;
  }

  /** The `fill` attribute for the current fill style, registering a gradient
   *  def the first time one is used. */
  private fillPaint(): string {
    const style = this.fillStyle as string | SvgGradient;
    if (typeof style === "string") return esc(style);
    let id = this.gradients.get(style);
    if (!id) {
      id = `g${this.gradients.size}`;
      this.gradients.set(style, id);
      const stops = style.stops
        .map(
          (stop) =>
            `<stop offset="${n(stop.offset)}" stop-color="${esc(stop.color)}"/>`,
        )
        .join("");
      this.defs.push(
        `<radialGradient id="${id}" gradientUnits="objectBoundingBox" ` +
          `cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`,
      );
    }
    return `url(#${id})`;
  }

  private opacity(): string {
    return this.globalAlpha >= 1 ? "" : ` opacity="${n(this.globalAlpha)}"`;
  }

  private strokeAttrs(): string {
    const color =
      typeof this.strokeStyle === "string" ? this.strokeStyle : "#000";
    return (
      ` stroke="${esc(color)}" stroke-width="${n(this.lineWidth)}"` +
      ` stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"` +
      ` fill="none"`
    );
  }

  // --- Emitting -------------------------------------------------------------

  fill(): void {
    if (this.path.length === 0) return;
    this.elements.push(
      `<path d="${this.path.join("")}" fill="${this.fillPaint()}"${this.opacity()}/>`,
    );
  }

  stroke(): void {
    if (this.path.length === 0) return;
    this.elements.push(
      `<path d="${this.path.join("")}"${this.strokeAttrs()}${this.opacity()}/>`,
    );
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.elements.push(
      `<rect x="${n(x + this.tx)}" y="${n(y + this.ty)}" width="${n(width)}" height="${n(height)}"` +
        ` fill="${this.fillPaint()}"${this.opacity()}/>`,
    );
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.elements.push(
      `<rect x="${n(x + this.tx)}" y="${n(y + this.ty)}" width="${n(width)}" height="${n(height)}"` +
        `${this.strokeAttrs()}${this.opacity()}/>`,
    );
  }

  fillText(text: string, x: number, y: number): void {
    // The canvas `font` shorthand is close enough to CSS to hand straight to
    // the `font` presentation attribute.
    this.elements.push(
      `<text x="${n(x + this.tx)}" y="${n(y + this.ty)}" fill="${this.fillPaint()}"` +
        ` style="font:${esc(this.font)}"${this.opacity()}>${esc(text)}</text>`,
    );
  }

  /** A bitmap goes in as an `<image>` carrying the same data URL the stroke
   *  holds, so the SVG stays one self-contained file. */
  drawImage(
    source: { src?: string },
    x: number,
    y: number,
    width: number,
    height: number,
  ): void {
    const href = typeof source.src === "string" ? source.src : "";
    if (!href) return;
    this.elements.push(
      `<image x="${n(x + this.tx)}" y="${n(y + this.ty)}" width="${n(width)}" height="${n(height)}"` +
        ` preserveAspectRatio="none" href="${esc(href)}"${this.opacity()}/>`,
    );
  }

  /** An SVG is transparent to begin with, so there is nothing to clear. */
  clearRect(): void {}

  /** Clipping is a screen-only affordance (the grid), and the grid never
   *  exports — so the export never needs to honour one. */
  clip(): void {}

  /** The recorded elements, wrapped in an `<svg>` framing `region`. */
  toSvg(region: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): string {
    const defs = this.defs.length ? `<defs>${this.defs.join("")}</defs>` : "";
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `width="${n(region.width)}" height="${n(region.height)}" ` +
      `viewBox="${n(region.x)} ${n(region.y)} ${n(region.width)} ${n(region.height)}">` +
      defs +
      this.elements.join("") +
      `</svg>`
    );
  }
}

/** Hand the recorder to code that wants a real 2D context. The cast is the
 *  point of the module: the painters only ever touch the surface above, and
 *  spelling that out in their types would mean writing every painter against
 *  something narrower than the canvas API they are written for. */
export function asContext2D(canvas: SvgCanvas): CanvasRenderingContext2D {
  return canvas as unknown as CanvasRenderingContext2D;
}
