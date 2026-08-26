/**
 * A 2-D `DOMMatrix` for the server.
 *
 * pdf.js traces small image masks into vector paths, and that path uses
 * `DOMMatrix` — a browser API Node does not provide. Scanning and OCR tools
 * routinely emit a page as Type3 fonts whose glyphs are little bitmap masks,
 * so a scanned lab report reaches this code even though we only ask for text
 * and never render anything. Without it the extraction dies with
 * "DOMMatrix is not defined".
 *
 * pdf.js offers to borrow the class from the optional `canvas` package, which
 * is a native dependency and a poor fit for a serverless deployment. What is
 * actually needed is the affine part, so that is what this provides — matching
 * the specification's post-multiplication order, which is what makes the
 * traced geometry come out right.
 */

type MatrixInit = number[] | { a?: number; b?: number; c?: number; d?: number; e?: number; f?: number };

export class ServerDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;

  constructor(init?: MatrixInit | string) {
    if (Array.isArray(init)) {
      // The spec also accepts a 16-value 3-D sequence; only the affine terms
      // of it matter here.
      const values = init.length >= 16 ? [init[0], init[1], init[4], init[5], init[12], init[13]] : init;
      const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = values;
      Object.assign(this, { a, b, c, d, e, f });
    } else if (init && typeof init === "object") {
      Object.assign(this, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, init);
    }
  }

  /** this = this × other, the order every *Self method below follows. */
  private multiply(o: { a: number; b: number; c: number; d: number; e: number; f: number }): this {
    const { a, b, c, d, e, f } = this;
    this.a = a * o.a + c * o.b;
    this.b = b * o.a + d * o.b;
    this.c = a * o.c + c * o.d;
    this.d = b * o.c + d * o.d;
    this.e = a * o.e + c * o.f + e;
    this.f = b * o.e + d * o.f + f;
    return this;
  }

  translateSelf(tx = 0, ty = 0): this {
    return this.multiply({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
  }

  // The z scale of the spec signature is accepted and ignored: this is 2-D.
  scaleSelf(sx = 1, sy?: number, sz = 1, ox = 0, oy = 0): this {
    void sz;
    const scaleY = sy ?? sx;
    if (ox || oy) this.translateSelf(ox, oy);
    this.multiply({ a: sx, b: 0, c: 0, d: scaleY, e: 0, f: 0 });
    if (ox || oy) this.translateSelf(-ox, -oy);
    return this;
  }

  rotateSelf(degrees = 0): this {
    const radians = (degrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return this.multiply({ a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 });
  }

  multiplySelf(other: MatrixInit): this {
    return this.multiply(new ServerDOMMatrix(other));
  }

  get isIdentity(): boolean {
    return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0;
  }

  get is2D(): boolean {
    return true;
  }

  toString(): string {
    return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`;
  }
}

/**
 * Put the class in place before pdf.js is imported: its own fallback runs at
 * module load and only checks whether the global already exists.
 */
export function installDomMatrix(): void {
  const scope = globalThis as { DOMMatrix?: unknown };
  if (!scope.DOMMatrix) scope.DOMMatrix = ServerDOMMatrix;
}
