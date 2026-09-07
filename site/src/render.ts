/**
 * Drawing. Nothing in here decides anything; it only shows what the chain
 * recorded and what the worker recomputed, side by side, so that agreement
 * and disagreement are both visible.
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The dish: the chain's recorded positions and the replay's path, on one plate. */
export class Dish {
  /** Positions the contract recorded, one per state, cumulative from genesis. */
  chain: Point[] = [];
  /** Positions the worker recomputed, one per state. */
  replay: Point[] = [];
  head: { x: number; y: number; heading: number; left: number; right: number } | null = null;
  /** Index in `replay` at which verification failed, or null. */
  divergedAt: number | null = null;
  private t0 = performance.now();

  constructor(private readonly canvas: HTMLCanvasElement) {}

  reset(): void {
    this.chain = [];
    this.replay = [];
    this.head = null;
    this.divergedAt = null;
  }

  draw(): void {
    const ctx = fitCanvas(this.canvas);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const now = (performance.now() - this.t0) / 1000;
    ctx.clearRect(0, 0, w, h);

    // Bounds over everything, so chain and replay share one frame and any
    // separation between them is real, not a projection artefact.
    const pts = [...this.chain, ...this.replay, { x: 0, y: 0 }];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const span = Math.max(maxX - minX, maxY - minY, 200);
    const pad = 48;
    const scale = Math.min(w - pad * 2, h - pad * 2) / span;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Organism y grows "up"; canvas y grows down. Flip so headings read naturally.
    const X = (x: number) => w / 2 + (x - cx) * scale;
    const Y = (y: number) => h / 2 - (y - cy) * scale;

    // Agar: faint concentric rings and a grid, so distance is legible.
    ctx.save();
    ctx.strokeStyle = css('--line');
    ctx.lineWidth = 1;
    const step = niceStep(span / 6);
    for (let gx = Math.floor(minX / step) * step - step; gx <= maxX + step; gx += step) {
      ctx.beginPath(); ctx.moveTo(X(gx), 0); ctx.lineTo(X(gx), h); ctx.stroke();
    }
    for (let gy = Math.floor(minY / step) * step - step; gy <= maxY + step; gy += step) {
      ctx.beginPath(); ctx.moveTo(0, Y(gy)); ctx.lineTo(w, Y(gy)); ctx.stroke();
    }
    ctx.fillStyle = css('--muted');
    ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
    ctx.fillText(`grid ${step} units`, 12, h - 12);
    ctx.restore();

    // Origin: genesis.
    ctx.save();
    ctx.strokeStyle = css('--muted');
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.arc(X(0), Y(0), 9, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    // Replay path, drawn first so chain markers sit on top of it.
    if (this.replay.length > 0) {
      const okColor = css('--accent');
      const badColor = css('--danger');
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X(0), Y(0));
      const cut = this.divergedAt ?? this.replay.length;
      for (let i = 0; i < Math.min(cut, this.replay.length); i++) ctx.lineTo(X(this.replay[i].x), Y(this.replay[i].y));
      ctx.strokeStyle = okColor;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = okColor;
      ctx.shadowBlur = 12;
      ctx.stroke();
      if (this.divergedAt !== null && this.replay.length > this.divergedAt) {
        ctx.beginPath();
        const from = this.divergedAt === 0 ? { x: 0, y: 0 } : this.replay[this.divergedAt - 1];
        ctx.moveTo(X(from.x), Y(from.y));
        for (let i = this.divergedAt; i < this.replay.length; i++) ctx.lineTo(X(this.replay[i].x), Y(this.replay[i].y));
        ctx.strokeStyle = badColor;
        ctx.shadowColor = badColor;
        ctx.setLineDash([6, 6]);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Chain markers: what the contract says. Hollow, so the path shows through.
    ctx.save();
    for (let i = 0; i < this.chain.length; i++) {
      const p = this.chain[i];
      const bad = this.divergedAt !== null && i >= this.divergedAt;
      ctx.strokeStyle = bad ? css('--danger') : css('--text');
      ctx.lineWidth = bad ? 2 : 1.25;
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), bad ? 7 : 4.5, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();

    // The worm itself, at the replay head, oriented by heading, wriggling.
    if (this.head) {
      const angle = (this.head.heading / 10) * (Math.PI / 180);
      const reversing = this.head.left < 0 || this.head.right < 0;
      const hx = X(this.head.x);
      const hy = Y(this.head.y);
      const len = 46;
      const segs = 14;
      ctx.save();
      ctx.translate(hx, hy);
      ctx.rotate(-angle);
      ctx.strokeStyle = this.divergedAt !== null ? css('--danger') : css('--text');
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const bx = -u * len;
        const by = Math.sin(u * Math.PI * 2 - now * (reversing ? -9 : 9)) * 5 * (0.3 + u);
        if (i === 0) ctx.moveTo(bx, by); else ctx.lineTo(bx, by);
      }
      ctx.lineWidth = 5;
      ctx.globalAlpha = 0.35;
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.fillStyle = css('--accent');
      ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / pow;
  return (m < 2 ? 1 : m < 5 ? 2 : 5) * pow;
}

/** 299 neurons as a grid of cells, lit by state value. */
export class CellGrid {
  private values: ArrayLike<number> = new Int8Array(0);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly count: number,
    private readonly cols: number,
    /** Value at which a cell reads as fully lit. Neurons fire at 30. */
    private readonly full: number,
  ) {}

  update(values: ArrayLike<number>): void {
    this.values = values;
  }

  draw(): void {
    const ctx = fitCanvas(this.canvas);
    const w = this.canvas.clientWidth;
    const rows = Math.ceil(this.count / this.cols);
    const gap = 2;
    const cell = Math.min((w - gap * (this.cols - 1)) / this.cols, (this.canvas.clientHeight - gap * (rows - 1)) / rows);
    ctx.clearRect(0, 0, w, this.canvas.clientHeight);
    const accent = css('--accent');
    const blue = css('--blue');
    for (let i = 0; i < this.count; i++) {
      const v = this.values[i] ?? 0;
      const col = i % this.cols;
      const row = Math.floor(i / this.cols);
      const x = col * (cell + gap);
      const y = row * (cell + gap);
      ctx.fillStyle = css('--cell');
      ctx.fillRect(x, y, cell, cell);
      if (v > 0) {
        ctx.globalAlpha = Math.min(1, 0.15 + (v / this.full) * 0.85);
        ctx.fillStyle = accent;
        ctx.fillRect(x, y, cell, cell);
        ctx.globalAlpha = 1;
      } else if (v < 0) {
        ctx.globalAlpha = Math.min(1, 0.15 + (-v / this.full) * 0.85);
        ctx.fillStyle = blue;
        ctx.fillRect(x, y, cell, cell);
        ctx.globalAlpha = 1;
      }
    }
  }
}
