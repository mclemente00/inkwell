import { getStroke } from 'perfect-freehand';
import type { PenTool, Stroke } from './types';

interface ToolSpec {
  size: number;
  thinning: number;
  smoothing: number;
  streamline: number;
  alpha: number;
}

export const TOOLS: Record<PenTool, ToolSpec> = {
  pen: { size: 2.6, thinning: 0.55, smoothing: 0.5, streamline: 0.45, alpha: 1 },
  pencil: { size: 1.7, thinning: 0.25, smoothing: 0.4, streamline: 0.35, alpha: 0.78 },
  marker: { size: 13, thinning: 0, smoothing: 0.6, streamline: 0.5, alpha: 0.32 },
};

export const ERASER_R = 7;

function triples(points: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < points.length; i += 3) out.push([points[i], points[i + 1], points[i + 2]]);
  return out;
}

/** Touch and mouse report a flat 0.5; only real stylus pressure varies. */
const hasPressure = (points: number[]) => {
  for (let i = 2; i < points.length; i += 3) if (points[i] !== 0.5) return true;
  return false;
};

export function strokePath(s: Pick<Stroke, 'tool' | 'points'>, last = true): Path2D {
  const t = TOOLS[s.tool];
  const outline = getStroke(triples(s.points), {
    size: t.size,
    thinning: t.thinning,
    smoothing: t.smoothing,
    streamline: t.streamline,
    simulatePressure: !hasPressure(s.points),
    last,
    start: { taper: s.tool === 'marker' ? 0 : 2 },
    end: { taper: s.tool === 'marker' ? 0 : 3 },
  });
  const path = new Path2D();
  if (!outline.length) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.closePath();
  return path;
}

export function paintStroke(ctx: CanvasRenderingContext2D, s: Pick<Stroke, 'tool' | 'points' | 'color'>, last = true) {
  ctx.globalAlpha = TOOLS[s.tool].alpha;
  ctx.fillStyle = s.color;
  ctx.fill(strokePath(s, last));
  ctx.globalAlpha = 1;
}

/** Does a circle at (x, y) touch the stroke? Checks segments, not just sample points. */
export function hitStroke(s: Stroke, x: number, y: number, r = ERASER_R): boolean {
  const pad = r + TOOLS[s.tool].size / 2;
  const p = s.points;
  if (p.length === 3) return Math.hypot(p[0] - x, p[1] - y) <= pad;
  for (let i = 0; i + 3 < p.length; i += 3) {
    const ax = p[i], ay = p[i + 1], bx = p[i + 3], by = p[i + 4];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    if (Math.hypot(ax + t * dx - x, ay + t * dy - y) <= pad) return true;
  }
  return false;
}

export function strokeBottom(s: Stroke): number {
  let m = 0;
  for (let i = 1; i < s.points.length; i += 3) m = Math.max(m, s.points[i]);
  return m;
}
