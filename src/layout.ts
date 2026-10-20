import { handOf, metricsFor, wrap, type Hand } from './fonts';
import { LINE_H, MARGIN_L, MARGIN_R, PAGE_W, RULE_AT, TOP_ROWS, drawPalette, inkColor, paperOf, type Paper } from './paper';
import { strokeBottom } from './draw';
import type { Note, Settings, TextBlock } from './types';

export interface Layout {
  L: number;
  fontSize: number;
  /** Offset from a row's top to where a line box must start so the baseline lands on the rule. */
  shift: number;
  hand: Hand;
  ink: string;
  paper: Paper;
  style: Settings['pageStyle'];
}

export function layoutFor(s: Settings): Layout {
  const L = LINE_H[s.size];
  const hand = handOf(s.font);
  const m = metricsFor(hand, L);
  return {
    L,
    fontSize: m.fontSize,
    shift: RULE_AT * L - m.baseline - 0.4,
    hand,
    ink: inkColor(s),
    paper: paperOf(s),
    style: s.pageStyle,
  };
}

/**
 * Stroke colours are stored as tokens so they follow the paper: 'ink' is the notebook ink,
 * 'p0'…'p4' are palette slots with light- and dark-paper variants. Anything else is literal.
 */
export function resolveColor(c: string, lay: Layout): string {
  if (c === 'ink') return lay.ink;
  const m = /^p(\d)$/.exec(c);
  return m ? (drawPalette(lay.paper.dark)[+m[1]] ?? lay.ink) : c;
}

export const blockWidth =(b: Pick<TextBlock, 'x'>) => PAGE_W - MARGIN_R - b.x;

/** Text blocks keep their y in units; on screen they sit on the nearest row. */
export const rowTop = (y: number, L: number) => Math.max(TOP_ROWS, Math.round(y / L)) * L;

export const blockLines = (b: TextBlock, lay: Layout) => wrap(lay.hand, lay.fontSize, b.text, blockWidth(b));

/** Where a tap should start a new block. Taps near the margin snap to it. */
export function placeAt(x: number, y: number, L: number): { x: number; y: number } {
  const row = Math.max(TOP_ROWS, Math.floor(y / L));
  let bx = x - 3;
  if (bx < MARGIN_L + 18) bx = MARGIN_L;
  bx = Math.min(bx, PAGE_W - MARGIN_R - 60);
  return { x: Math.round(bx), y: row * L };
}

export function contentBottom(n: Note, lay: Layout): number {
  let m = 0;
  for (const b of n.blocks) m = Math.max(m, rowTop(b.y, lay.L) + blockLines(b, lay).length * lay.L);
  for (const s of n.strokes) m = Math.max(m, strokeBottom(s));
  return m;
}

/** Pages are at least one screen tall and always leave room below the last thing written. */
export const pageHeight = (n: Note, lay: Layout, minH: number) =>
  Math.ceil(Math.max(minH, contentBottom(n, lay) + lay.L * 8) / lay.L) * lay.L;

/** Dots are tiny, so they get a stronger version of the rule colour. */
export const dotColor = (p: Paper) => p.rule.replace(/[\d.]+\)$/, (a) => `${Math.min(1, parseFloat(a) * 2.6)})`);

/** CSS background for the ruling, in page units. */
export function patternCss(lay: Layout): Record<string, string> {
  const { L, paper } = lay;
  const r = RULE_AT * L;
  const c = paper.rule;
  switch (lay.style) {
    case 'lined':
      return {
        backgroundImage: `linear-gradient(to bottom, transparent ${r - 0.5}px, ${c} ${r - 0.5}px, ${c} ${r + 0.5}px, transparent ${r + 0.5}px)`,
        backgroundSize: `100% ${L}px`,
      };
    case 'grid': {
      const g = L / 2;
      return {
        backgroundImage: `linear-gradient(to bottom, ${c} 0.6px, transparent 0.6px), linear-gradient(to right, ${c} 0.6px, transparent 0.6px)`,
        backgroundSize: `${g}px ${g}px`,
        backgroundPosition: `${(MARGIN_L % g) - 0.3}px ${(r % g) - 0.3}px`,
      };
    }
    case 'dotted':
      return {
        backgroundImage: `radial-gradient(circle, ${dotColor(paper)} 0.9px, transparent 1.1px)`,
        backgroundSize: `${L / 2}px ${L / 2}px`,
        backgroundPosition: `${MARGIN_L - L / 4}px ${r - L / 4}px`,
      };
    default:
      return {};
  }
}
