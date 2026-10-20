import { useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

/**
 * Pull down to close: spread `handlers` on the grab area (a header or grabber) and `style` on the
 * panel that should follow the finger. A long or quick pull closes it; anything else springs back.
 * Presses that start on a button are left alone, so taps still work.
 */
export function usePullToDismiss(onClose: () => void) {
  const [dy, setDy] = useState(0);
  const [settling, setSettling] = useState(false);
  const start = useRef<{ id: number; y0: number; t0: number } | null>(null);

  const end = (e: PointerEvent, allowClose: boolean) => {
    const g = start.current;
    if (!g || g.id !== e.pointerId) return;
    start.current = null;
    const d = Math.max(0, e.clientY - g.y0);
    const speed = d / Math.max(1, performance.now() - g.t0);
    setSettling(true);
    if (allowClose && (d > 110 || (d > 40 && speed > 0.6))) {
      setDy(window.innerHeight);
      setTimeout(onClose, 200);
    } else setDy(0);
  };

  const handlers = {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, a, label')) return;
      start.current = { id: e.pointerId, y0: e.clientY, t0: performance.now() };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setSettling(false);
    },
    onPointerMove(e: PointerEvent) {
      const g = start.current;
      if (!g || g.id !== e.pointerId) return;
      setDy(Math.max(0, e.clientY - g.y0));
    },
    onPointerUp: (e: PointerEvent) => end(e, true),
    onPointerCancel: (e: PointerEvent) => end(e, false),
  };

  const style: JSX.CSSProperties | undefined =
    dy || settling ? { transform: `translateY(${dy}px)`, transition: settling ? 'transform 200ms ease' : 'none' } : undefined;

  return { handlers, style };
}
