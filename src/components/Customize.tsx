import { HANDS, cssFamily } from '../fonts';
import { INKS, PAPERS } from '../paper';
import type { HandSize, PageStyle, Settings } from '../types';
import { Sheet } from './Sheet';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

const STYLES: { id: PageStyle; label: string }[] = [
  { id: 'lined', label: 'Lined' },
  { id: 'grid', label: 'Grid' },
  { id: 'dotted', label: 'Dotted' },
  { id: 'blank', label: 'Blank' },
];

const SIZES: { id: HandSize; label: string }[] = [
  { id: 'S', label: 'Small' },
  { id: 'M', label: 'Medium' },
  { id: 'L', label: 'Large' },
];

const SAMPLE = 'the quick brown fox jumps over the lazy dog';

export function Customize({ settings: s, onChange, onClose }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch });
  const paper = PAPERS.find((p) => p.id === s.paper)!;
  const inkFor = (id: string) => {
    const ink = INKS.find((i) => i.id === id)!;
    return paper.dark ? ink.onDark : ink.onLight;
  };

  return (
    <Sheet title="Customise" onClose={onClose} tall>
      <section class="cz-section">
        <h3>
          Paper <span class="cz-value">{paper.label}</span>
        </h3>
        <div class="swatches" role="radiogroup" aria-label="Paper colour">
          {PAPERS.map((p) => (
            <button
              key={p.id}
              role="radio"
              aria-checked={s.paper === p.id}
              aria-label={p.label}
              class={`swatch ${s.paper === p.id ? 'on' : ''}`}
              style={{ background: p.bg }}
              onClick={() => set({ paper: p.id })}
            />
          ))}
        </div>
      </section>

      <section class="cz-section">
        <h3>
          Ink <span class="cz-value">{INKS.find((i) => i.id === s.ink)!.label}</span>
        </h3>
        <div class="swatches" role="radiogroup" aria-label="Ink colour">
          {INKS.map((i) => (
            <button
              key={i.id}
              role="radio"
              aria-checked={s.ink === i.id}
              aria-label={i.label}
              class={`swatch ${s.ink === i.id ? 'on' : ''}`}
              style={{ background: inkFor(i.id) }}
              onClick={() => set({ ink: i.id })}
            />
          ))}
        </div>
      </section>

      <section class="cz-section">
        <h3>
          Pages <span class="cz-value">{STYLES.find((x) => x.id === s.pageStyle)!.label}</span>
        </h3>
        <div class="styles" role="radiogroup" aria-label="Page ruling">
          {STYLES.map((st) => (
            <button
              key={st.id}
              role="radio"
              aria-checked={s.pageStyle === st.id}
              class={`style-tile st-${st.id} ${s.pageStyle === st.id ? 'on' : ''}`}
              style={{ background: paper.bg, color: paper.rule }}
              onClick={() => set({ pageStyle: st.id })}
            >
              <span class="sr">{st.label}</span>
            </button>
          ))}
        </div>
      </section>

      <section class="cz-section">
        <h3>Handwriting</h3>
        <div class="segmented" role="radiogroup" aria-label="Handwriting size">
          {SIZES.map((z) => (
            <button key={z.id} role="radio" aria-checked={s.size === z.id} class={s.size === z.id ? 'on' : ''} onClick={() => set({ size: z.id })}>
              {z.label}
            </button>
          ))}
        </div>
        <ul class="hands" role="radiogroup" aria-label="Handwriting">
          {HANDS.map((h) => (
            <li key={h.id}>
              <button role="radio" aria-checked={s.font === h.id} class={`hand ${s.font === h.id ? 'on' : ''}`} onClick={() => set({ font: h.id })}>
                <span class="hand-sample" style={{ fontFamily: cssFamily(h), color: inkFor(s.ink) }}>
                  {SAMPLE}
                </span>
                <span class="hand-meta">
                  <b>{h.label}</b> {h.blurb}
                </span>
                <span class="radio" aria-hidden="true" />
              </button>
            </li>
          ))}
          <li>
            <div class="hand disabled">
              <span class="hand-sample own">Your own handwriting</span>
              <span class="hand-meta">Draw your alphabet and type with it. Coming in the next version.</span>
            </div>
          </li>
        </ul>
      </section>
    </Sheet>
  );
}
