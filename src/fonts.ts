import '@fontsource/caveat/latin-400.css';
import '@fontsource/kalam/latin-400.css';
import '@fontsource/homemade-apple/latin-400.css';
import '@fontsource/shadows-into-light/latin-400.css';
import '@fontsource/patrick-hand/latin-400.css';
import '@fontsource/indie-flower/latin-400.css';
import '@fontsource/gochi-hand/latin-400.css';
import '@fontsource/nanum-pen-script/latin-400.css';
import '@fontsource/reenie-beanie/latin-400.css';
import '@fontsource/covered-by-your-grace/latin-400.css';
import '@fontsource/gloria-hallelujah/latin-400.css';
import '@fontsource/sue-ellen-francisco/latin-400.css';
import '@fontsource/young-serif/latin-400.css';

export interface Hand {
  id: string;
  family: string;
  label: string;
  blurb: string;
}

/** Twelve open-licence (OFL) handwriting faces. */
export const HANDS: Hand[] = [
  { id: 'caveat', family: 'Caveat', label: 'Caveat', blurb: 'quick, slanted, everyday notes' },
  { id: 'kalam', family: 'Kalam', label: 'Kalam', blurb: 'neat and upright, like a tidy diary' },
  { id: 'homemade-apple', family: 'Homemade Apple', label: 'Homemade Apple', blurb: 'loopy cursive with a lot of character' },
  { id: 'shadows', family: 'Shadows Into Light', label: 'Shadows Into Light', blurb: 'light, tall and airy' },
  { id: 'patrick', family: 'Patrick Hand', label: 'Patrick Hand', blurb: 'friendly print, easy to read' },
  { id: 'indie', family: 'Indie Flower', label: 'Indie Flower', blurb: 'round and relaxed' },
  { id: 'gochi', family: 'Gochi Hand', label: 'Gochi Hand', blurb: 'bold marker on a sticky note' },
  { id: 'nanum', family: 'Nanum Pen Script', label: 'Nanum Pen', blurb: 'narrow fineliner, fits a lot per line' },
  { id: 'reenie', family: 'Reenie Beanie', label: 'Reenie Beanie', blurb: 'scrawled in a hurry' },
  { id: 'grace', family: 'Covered By Your Grace', label: 'Covered By Your Grace', blurb: 'chunky felt-tip capitals' },
  { id: 'gloria', family: 'Gloria Hallelujah', label: 'Gloria Hallelujah', blurb: 'comic-book bounce' },
  { id: 'sue', family: 'Sue Ellen Francisco', label: 'Sue Ellen Francisco', blurb: 'skinny, tall and quirky' },
];

export const handOf = (id: string) => HANDS.find((h) => h.id === id) ?? HANDS[0];
export const cssFamily = (h: Hand) => `'${h.family}', 'Comic Sans MS', cursive`;

export interface HandMetrics {
  fontSize: number;
  /** Distance from the top of a line box to the baseline, in units, for the given line height. */
  baseline: number;
}

const ref = new Map<string, { xh: number; asc: number; desc: number }>();
let ctx: CanvasRenderingContext2D | null = null;
const getCtx = () => (ctx ??= document.createElement('canvas').getContext('2d')!);

/** Read x-height and ascent/descent at 100px so every face can be scaled to the same visual size. */
function refMetrics(h: Hand) {
  let m = ref.get(h.id);
  if (m) return m;
  const c = getCtx();
  c.font = `100px ${cssFamily(h)}`;
  const x = c.measureText('xvwz');
  const full = c.measureText('Hgjpqy');
  m = {
    xh: x.actualBoundingBoxAscent || 50,
    asc: full.fontBoundingBoxAscent || full.actualBoundingBoxAscent || 90,
    desc: full.fontBoundingBoxDescent || full.actualBoundingBoxDescent || 30,
  };
  ref.set(h.id, m);
  return m;
}

/** Size a hand so its x-height is a fixed share of the line height, then find its baseline. */
export function metricsFor(h: Hand, lineH: number): HandMetrics {
  const m = refMetrics(h);
  let fontSize = (lineH * 0.34) / (m.xh / 100);
  fontSize = Math.min(fontSize, lineH * 1.25);
  const k = fontSize / 100;
  const baseline = (lineH - (m.asc + m.desc) * k) / 2 + m.asc * k;
  return { fontSize, baseline };
}

export async function loadHands(): Promise<void> {
  const loads = [...HANDS.map((h) => `100px '${h.family}'`), `100px 'Young Serif'`].map((f) =>
    document.fonts.load(f).catch(() => []),
  );
  await Promise.all(loads);
  ref.clear();
}

/** Measure a string in a hand at a given size (page units). */
export function measure(h: Hand, fontSize: number, s: string): number {
  const c = getCtx();
  c.font = `${fontSize}px ${cssFamily(h)}`;
  return c.measureText(s).width;
}

/** Word-wrap text to a width using the same measurements the canvas export uses. */
export function wrap(h: Hand, fontSize: number, text: string, width: number): string[] {
  const fits = (t: string) => measure(h, fontSize, t) <= width;
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const w of para.split(/(\s+)/)) {
      if (!w) continue;
      if (fits(line + w)) {
        line += w;
        continue;
      }
      if (/^\s+$/.test(w)) {
        out.push(line);
        line = '';
        continue;
      }
      if (line.trim()) out.push(line.trimEnd());
      line = '';
      if (fits(w)) {
        line = w;
        continue;
      }
      // A single word wider than the line: break it by characters.
      for (const ch of w) {
        if (line && !fits(line + ch)) {
          out.push(line);
          line = ch;
        } else line += ch;
      }
    }
    out.push(line.trimEnd());
  }
  return out;
}

/** Small, stable wobble per character so typed text doesn't look machine-set. */
export function jitter(seed: string, i: number): { rot: number; dy: number } {
  let x = 2166136261;
  const s = seed + ':' + i;
  for (let k = 0; k < s.length; k++) x = Math.imul(x ^ s.charCodeAt(k), 16777619);
  const a = ((x >>> 0) % 1000) / 1000 - 0.5;
  const b = (((x >>> 10) >>> 0) % 1000) / 1000 - 0.5;
  return { rot: a * 4, dy: b * 0.9 };
}
