import { cssFamily, jitter } from './fonts';
import { paintStroke } from './draw';
import { MARGIN_L, PAGE_W, RULE_AT, TOP_ROWS } from './paper';
import { blockLines, contentBottom, dotColor, resolveColor, rowTop, type Layout } from './layout';
import type { Note } from './types';

/** Paint a note the way the page shows it, at `scale` pixels per page unit. */
export function renderNote(note: Note, lay: Layout, scale = 3): HTMLCanvasElement {
  const { L } = lay;
  const H = Math.ceil((Math.max(contentBottom(note, lay), L * 12) + L * 2) / L) * L;
  const c = document.createElement('canvas');
  c.width = Math.round(PAGE_W * scale);
  c.height = Math.round(H * scale);
  const ctx = c.getContext('2d')!;
  ctx.scale(scale, scale);

  ctx.fillStyle = lay.paper.bg;
  ctx.fillRect(0, 0, PAGE_W, H);

  // Matches the .pattern layer: ruling starts one row above the first writing row.
  const top = Math.max(0, TOP_ROWS - 1) * L;
  const r = RULE_AT * L;
  ctx.fillStyle = lay.paper.rule;
  if (lay.style === 'lined') {
    for (let y = top + r; y < H; y += L) ctx.fillRect(0, y - 0.5, PAGE_W, 1);
    ctx.fillStyle = lay.paper.margin;
    ctx.fillRect(MARGIN_L - 7, 0, 1, H);
  } else if (lay.style === 'grid') {
    const g = L / 2;
    for (let y = r % g; y < H; y += g) if (y >= top) ctx.fillRect(0, y - 0.3, PAGE_W, 0.6);
    for (let x = MARGIN_L % g; x < PAGE_W; x += g) ctx.fillRect(x - 0.3, top, 0.6, H - top);
  } else if (lay.style === 'dotted') {
    const g = L / 2;
    ctx.fillStyle = dotColor(lay.paper);
    for (let y = r % g; y < H; y += g) {
      if (y < top) continue;
      for (let x = MARGIN_L % g; x < PAGE_W; x += g) {
        ctx.beginPath();
        ctx.arc(x, y, 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = lay.ink;
  ctx.font = `${lay.fontSize}px ${cssFamily(lay.hand)}`;
  ctx.textBaseline = 'alphabetic';
  for (const b of note.blocks) {
    const lines = blockLines(b, lay);
    let n = 0;
    lines.forEach((line, li) => {
      const baseY = rowTop(b.y, lay.L) + li * L + r - 0.4;
      let x = b.x;
      for (const ch of line) {
        const j = jitter(b.id, n++);
        const w = ctx.measureText(ch).width;
        ctx.save();
        ctx.translate(x + w / 2, baseY - lay.fontSize * 0.3 + j.dy);
        ctx.rotate((j.rot * Math.PI) / 180);
        ctx.fillText(ch, -w / 2, lay.fontSize * 0.3);
        ctx.restore();
        x += w;
      }
    });
  }

  for (const s of note.strokes) paintStroke(ctx, { ...s, color: resolveColor(s.color, lay) });
  return c;
}

export async function shareNote(note: Note, lay: Layout, name: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const canvas = renderNote(note, lay);
  const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
  const file = new File([blob], `${name}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
