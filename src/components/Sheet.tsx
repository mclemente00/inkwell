import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';

interface Props {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  tall?: boolean;
  leading?: ComponentChildren;
}

export function Sheet({ title, onClose, children, tall, leading }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <div class="sheet-backdrop" onClick={onClose} />
      <div class={`sheet ${tall ? 'tall' : ''}`}>
        <div class="sheet-grabber" />
        <header class="sheet-head">
          {leading}
          <h2>{title}</h2>
          <button class="pill-btn" onClick={onClose}>
            Done
          </button>
        </header>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
