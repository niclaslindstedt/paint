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
  strokeStyle: string | SvgGradient;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  font: string;
  textBaseline: CanvasTextBaseline;
  imageSmoothingEnabled: boolean;
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
  globalCompositeOperation: "source-over",
  font: "10px sans-serif",
  textBaseline: "alphabetic",
  imageSmoothingEnabled: true,
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
 * What the two gradient calls hand back: a paint the recorder can turn into a
 * `<radialGradient>` or a `<linearGradient>` def.
 *
 * The two are emitted in **different units**, and each is the right one for the
 * only caller it has:
 *
 *   - **Radial** — the airbrush, and it uses one in a single shape: a cone
 *     centred on the dab it fills, running from the middle to the rim. So the
 *     def can use `objectBoundingBox` units, because for a circle whose centre
 *     and radius are the gradient's own, "the middle of the box" and "half the
 *     box" are exactly the right numbers — and one def then serves every dab of
 *     the stroke rather than one def per dab.
 *   - **Linear** — the gradient tool, whose ramp is a line across the *page*
 *     that has nothing to do with the box of the area it happens to fill (see
 *     `Gradient`). Fitting that to a bounding box would re-aim the ramp, so the
 *     def carries the real coordinates and says `userSpaceOnUse`.
 */
class SvgGradient {
  readonly stops: { offset: number; color: string }[] = [];
  /** The run, for a linear ramp; absent for the radial one. */
  constructor(
    readonly line?: { x1: number; y1: number; x2: number; y2: number },
  ) {}
  addColorStop(offset: number, color: string): void {
    this.stops.push({ offset, color });
  }
}

/**
 * A 2D context that writes SVG.
 *
 * Deliberately *only* the subset the painters use: paths, rectangles, ellipses,
 * text (with the one baseline the text tool sets), images, radial-gradient
 * fills, a translation, the two composite modes the renderer sets, and the ink
 * properties `applyInk` sets. Calls it has no meaning for (`clearRect` — an SVG
 * starts transparent; `clip` — whose two callers are both answered by the
 * file's own `viewBox`, see below) are accepted and ignored, so a caller can
 * hand it to the shared renderer unchanged.
 *
 * The two composite modes are the interesting part, because SVG has no
 * compositing operator and both have an exact structural equivalent:
 *
 *   - **`destination-over`** — what the sheet and the grid are laid down with —
 *     is *painted first*. So a call made in this mode is collected in a list of
 *     its own that the file opens with, rather than appended to the drawing, and
 *     the file comes out in the order a reader paints it in.
 *   - **`destination-out`** — what an erasing tool's mark is painted with — is a
 *     `<mask>`. The shapes recorded while it is set are collected as black (mask
 *     black is transparent), everything recorded *before* them is wrapped in a
 *     group wearing that mask, and the group is what the rest of the file is
 *     appended to. Runs of erasing therefore nest, which is exactly the order
 *     they happened in.
 */
export class SvgCanvas {
  private elements: string[] = [];
  /** What was painted `destination-over` — the sheet, and the screen's grid if
   *  one ever reached a file. Kept apart from the elements rather than
   *  unshifted in among them so that "everything under the drawing" stays
   *  something the file can name: the erasing masks below wrap the drawing and
   *  not the sheet. */
  private under: string[] = [];
  private defs: string[] = [];
  private gradients = new Map<SvgGradient, string>();
  private stack: PaintedState[] = [];
  private path: string[] = [];
  private tx = 0;
  private ty = 0;
  /** The shapes recorded since the current run of erasing began, or `null` when
   *  nothing is being rubbed out. */
  private lifted: string[] | null = null;
  /** One mask per closed run of erasing. The white rectangle that makes the
   *  rest of the mask opaque needs the framing region, which isn't known until
   *  `toSvg`, so the defs are written there. */
  private masks: { id: string; shapes: string[] }[] = [];

  // --- The properties the painters write -----------------------------------
  fillStyle: string | CanvasGradient | CanvasPattern =
    INITIAL.fillStyle as string;
  strokeStyle: string | CanvasGradient | CanvasPattern = INITIAL.strokeStyle;
  lineWidth = INITIAL.lineWidth;
  lineCap: CanvasLineCap = INITIAL.lineCap;
  lineJoin: CanvasLineJoin = INITIAL.lineJoin;
  globalAlpha = INITIAL.globalAlpha;
  globalCompositeOperation: GlobalCompositeOperation =
    INITIAL.globalCompositeOperation;
  font = INITIAL.font;
  textBaseline: CanvasTextBaseline = INITIAL.textBaseline;
  imageSmoothingEnabled = INITIAL.imageSmoothingEnabled;

  save(): void {
    this.stack.push({
      fillStyle: this.fillStyle as string | SvgGradient,
      strokeStyle: this.strokeStyle as string | SvgGradient,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      lineJoin: this.lineJoin,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      font: this.font,
      textBaseline: this.textBaseline,
      imageSmoothingEnabled: this.imageSmoothingEnabled,
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
    this.globalCompositeOperation = prev.globalCompositeOperation;
    this.font = prev.font;
    this.textBaseline = prev.textBaseline;
    this.imageSmoothingEnabled = prev.imageSmoothingEnabled;
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

  /** …and the ramp a poured area is filled with. The run is recorded through
   *  the current translation, exactly as the geometry it inks is, so the two
   *  cannot drift apart. */
  createLinearGradient(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): CanvasGradient {
    return new SvgGradient({
      x1: x0 + this.tx,
      y1: y0 + this.ty,
      x2: x1 + this.tx,
      y2: y1 + this.ty,
    }) as unknown as CanvasGradient;
  }

  // --- Compositing ----------------------------------------------------------

  /** Whether the call being recorded is taking ink off rather than putting it
   *  on — which is what decides both where it is written and what colour it is
   *  written in. */
  private get erasing(): boolean {
    return this.globalCompositeOperation === "destination-out";
  }

  /** File one recorded element, wherever this composite mode puts it. */
  private emit(element: string): void {
    if (this.erasing) {
      (this.lifted ??= []).push(element);
      return;
    }
    this.closeMask();
    if (this.globalCompositeOperation === "destination-over") {
      this.under.unshift(element);
    } else {
      this.elements.push(element);
    }
  }

  /** End a run of erasing: every mark recorded so far becomes one group wearing
   *  a mask with the lifted shapes punched out of it. A no-op when nothing has
   *  been rubbed out, which is every drawing that never reached for the eraser.
   *
   *  The sheet survives it because the sheet is not in this list: it is laid
   *  down `destination-over` and kept in `under`, in front of the finished
   *  group, so no mask ever reaches it. */
  private closeMask(): void {
    const shapes = this.lifted;
    this.lifted = null;
    if (!shapes || shapes.length === 0) return;
    const id = `m${this.masks.length}`;
    this.masks.push({ id, shapes });
    this.elements = [`<g mask="url(#${id})">${this.elements.join("")}</g>`];
  }

  /** The `fill` attribute for the current fill style, registering a gradient
   *  def the first time one is used. */
  private fillPaint(): string {
    // Inside a mask, black is "gone". A rubbing out has a colour on it (the
    // renderer resolves one for every mark), and on a real canvas
    // `destination-out` throws it away and keeps the alpha — so the mask does
    // the same, and a half-opaque eraser stroke lifts half the ink here too.
    if (this.erasing) return "#000";
    return this.paint(this.fillStyle as string | SvgGradient);
  }

  /** One paint, as an attribute value: a colour written out, or a gradient
   *  registered as a def and referenced. Shared by the fill and the stroke,
   *  because a mark inked with a ramp is inked with it whichever way round it is
   *  painted — the gradient tool strokes its feathered skirt with the same paint
   *  it fills the area with. */
  private paint(style: string | SvgGradient): string {
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
      const line = style.line;
      this.defs.push(
        line
          ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" ` +
              `x1="${n(line.x1)}" y1="${n(line.y1)}" ` +
              `x2="${n(line.x2)}" y2="${n(line.y2)}">${stops}</linearGradient>`
          : `<radialGradient id="${id}" gradientUnits="objectBoundingBox" ` +
              `cx="0.5" cy="0.5" r="0.5">${stops}</radialGradient>`,
      );
    }
    return `url(#${id})`;
  }

  private opacity(): string {
    return this.globalAlpha >= 1 ? "" : ` opacity="${n(this.globalAlpha)}"`;
  }

  private strokeAttrs(): string {
    const color = this.erasing
      ? "#000"
      : this.paint(this.strokeStyle as string | SvgGradient);
    return (
      ` stroke="${color}" stroke-width="${n(this.lineWidth)}"` +
      ` stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"` +
      ` fill="none"`
    );
  }

  // --- Emitting -------------------------------------------------------------

  fill(): void {
    if (this.path.length === 0) return;
    this.emit(
      `<path d="${this.path.join("")}" fill="${this.fillPaint()}"${this.opacity()}/>`,
    );
  }

  stroke(): void {
    if (this.path.length === 0) return;
    this.emit(
      `<path d="${this.path.join("")}"${this.strokeAttrs()}${this.opacity()}/>`,
    );
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.emit(
      `<rect x="${n(x + this.tx)}" y="${n(y + this.ty)}" width="${n(width)}" height="${n(height)}"` +
        ` fill="${this.fillPaint()}"${this.opacity()}/>`,
    );
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    this.emit(
      `<rect x="${n(x + this.tx)}" y="${n(y + this.ty)}" width="${n(width)}" height="${n(height)}"` +
        `${this.strokeAttrs()}${this.opacity()}/>`,
    );
  }

  fillText(text: string, x: number, y: number): void {
    // The canvas `font` shorthand is close enough to CSS to hand straight to
    // the `font` presentation attribute.
    //
    // The baseline is not: a canvas anchors text wherever `textBaseline` says,
    // an SVG `<text>` always on the alphabetic baseline. A caption is anchored
    // at its top (see `plugins/builtin/text.ts`), so the one baseline this app
    // actually sets is carried across as `dominant-baseline` — without it every
    // exported caption sits a line higher than it did on screen.
    const baseline =
      this.textBaseline === "top"
        ? ` dominant-baseline="text-before-edge"`
        : "";
    this.emit(
      `<text x="${n(x + this.tx)}" y="${n(y + this.ty)}" fill="${this.fillPaint()}"` +
        `${baseline} style="font:${esc(this.font)}"${this.opacity()}>${esc(text)}</text>`,
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
    // A picture the page asked to keep square-pixelled says so in the file too,
    // or an SVG of a scaled-up screenshot comes out blurred where the app
    // showed it crisp.
    const rendering = this.imageSmoothingEnabled
      ? ""
      : ` image-rendering="pixelated"`;
    this.emit(
      `<image x="${n(x + this.tx)}" y="${n(y + this.ty)}" width="${n(width)}" height="${n(height)}"` +
        ` preserveAspectRatio="none"${rendering} href="${esc(href)}"${this.opacity()}/>`,
    );
  }

  /** An SVG is transparent to begin with, so there is nothing to clear. */
  clearRect(): void {}

  /** Clipping is accepted and dropped, and the two clips that reach here are
   *  both already answered by the file's shape.
   *
   *  The grid's is screen-only and the grid never exports. The sheet's — the
   *  page rectangle every mark is held inside (see `onSheet` in `render.ts`) —
   *  is the `viewBox` this recorder frames the file with, and an SVG's root
   *  viewport clips to that on its own. So the picture is the same picture;
   *  what an exported file carries that a rasterised one does not is the
   *  geometry of a stroke that ran off the page, which is exactly what the
   *  document itself carries. */
  clip(): void {}

  /** The masks the erasing runs left, as defs. Written here because a mask has
   *  to start out *opaque* everywhere the eraser didn't go, and "everywhere" is
   *  the framing region, which the recorder only learns at the end. */
  private maskDefs(region: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): string {
    const box =
      `x="${n(region.x)}" y="${n(region.y)}"` +
      ` width="${n(region.width)}" height="${n(region.height)}"`;
    return this.masks
      .map(
        (mask) =>
          `<mask id="${mask.id}" maskUnits="userSpaceOnUse" ${box}>` +
          `<rect ${box} fill="#fff"/>${mask.shapes.join("")}</mask>`,
      )
      .join("");
  }

  /** The recorded elements, wrapped in an `<svg>` framing `region`. */
  toSvg(region: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): string {
    // A drawing whose last mark was a rubbing out leaves a run still open.
    this.closeMask();
    const defs = [...this.defs, this.maskDefs(region)].join("");
    const body = this.under.join("") + this.elements.join("");
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" ` +
      `width="${n(region.width)}" height="${n(region.height)}" ` +
      `viewBox="${n(region.x)} ${n(region.y)} ${n(region.width)} ${n(region.height)}">` +
      (defs ? `<defs>${defs}</defs>` : "") +
      body +
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
