import type { HandSize, InkId, PaperId, Settings } from './types';

/** Logical page width. Everything on a page is laid out in these units, then scaled to the screen. */
export const PAGE_W = 360;
export const MARGIN_L = 30;
export const MARGIN_R = 14;
export const TOP_ROWS = 2;

export const LINE_H: Record<HandSize, number> = { S: 24, M: 30, L: 38 };

/** Where the ruled line sits inside a row, as a fraction of line height. */
export const RULE_AT = 0.8;

export interface Paper {
  id: PaperId;
  label: string;
  bg: string;
  rule: string;
  margin: string;
  dark: boolean;
}

export const PAPERS: Paper[] = [
  { id: 'cream', label: 'Cream', bg: '#f6efe0', rule: 'rgba(60,90,150,0.20)', margin: 'rgba(200,80,80,0.28)', dark: false },
  { id: 'white', label: 'White', bg: '#fbfbf8', rule: 'rgba(60,90,150,0.18)', margin: 'rgba(200,80,80,0.25)', dark: false },
  { id: 'blush', label: 'Blush', bg: '#f7e6e2', rule: 'rgba(150,70,90,0.18)', margin: 'rgba(200,80,80,0.30)', dark: false },
  { id: 'sage', label: 'Sage', bg: '#e7ede2', rule: 'rgba(60,100,80,0.20)', margin: 'rgba(180,90,70,0.26)', dark: false },
  { id: 'midnight', label: 'Midnight', bg: '#1f2430', rule: 'rgba(200,215,255,0.13)', margin: 'rgba(240,130,130,0.22)', dark: true },
];

export interface Ink {
  id: InkId;
  label: string;
  onLight: string;
  onDark: string;
}

export const INKS: Ink[] = [
  { id: 'marine', label: 'Marine', onLight: '#23407a', onDark: '#a3b9ef' },
  { id: 'plum', label: 'Plum', onLight: '#6a2c5c', onDark: '#dcaad0' },
  { id: 'rust', label: 'Rust', onLight: '#a2501d', onDark: '#f1ab7f' },
  { id: 'teal', label: 'Teal', onLight: '#1b6a66', onDark: '#86d3cb' },
  { id: 'graphite', label: 'Graphite', onLight: '#2a2a2a', onDark: '#e8e8e8' },
];

export const paperOf = (s: Settings) => PAPERS.find((p) => p.id === s.paper) ?? PAPERS[0];
export const inkColor = (s: Settings) => {
  const ink = INKS.find((i) => i.id === s.ink) ?? INKS[0];
  return paperOf(s).dark ? ink.onDark : ink.onLight;
};

/** Extra colours for drawing, besides the notebook's ink. */
export function drawPalette(dark: boolean): string[] {
  return dark
    ? ['#f1f1f1', '#f2c35b', '#f08a7e', '#8fd18a', '#8fb7f2']
    : ['#1f1f1f', '#d99a14', '#c8402f', '#3b8c3a', '#2f62c4'];
}
