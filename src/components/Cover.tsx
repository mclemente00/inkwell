import { useRef, useState } from 'preact/hooks';
import { cssFamily, handOf } from '../fonts';
import type { Settings } from '../types';

interface Props {
  settings: Settings;
  status: string;
  onOpen: () => Promise<void> | void;
  onOpened: () => void;
}

export function Cover({ settings, status, onOpen, onOpened }: Props) {
  const [opening, setOpening] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ x: number; y: number } | null>(null);

  async function open() {
    if (opening) return;
    await onOpen();
    setOpening(true);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(onOpened, reduced ? 0 : 720);
  }

  function down(e: PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!start.current) return;
    // Pull from the right edge, like lifting a cover.
    setDrag(Math.max(0, Math.min(1, (start.current.x - e.clientX) / (window.innerWidth * 0.6))));
  }
  function up(e: PointerEvent) {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = s.x - e.clientX;
    const dy = s.y - e.clientY;
    setDrag(0);
    if (dx > 50 || dy > 60 || (Math.abs(dx) < 8 && Math.abs(dy) < 8)) open();
  }

  const hand = handOf(settings.font);
  return (
    <div
      class={`cover ${opening ? 'opening' : ''}`}
      style={!opening && drag ? { transform: `perspective(1600px) rotateY(${-drag * 40}deg)` } : undefined}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = null;
        setDrag(0);
      }}
      role="button"
      tabIndex={0}
      aria-label="Open notebook"
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open()}
    >
      <div class="cover-grain" />
      <div class="cover-band" />
      <div class="cover-label">
        <span class="cover-title">Inkwell</span>
        <span class="cover-name" style={{ fontFamily: cssFamily(hand) }}>
          {settings.name || 'Your name'}
        </span>
      </div>
      <div class="cover-hint">{status || 'Swipe or tap to open'}</div>
    </div>
  );
}
