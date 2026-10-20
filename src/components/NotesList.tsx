import { useMemo, useState } from 'preact/hooks';
import { cssFamily, handOf } from '../fonts';
import { distance, fmtDistance, NEARBY_M } from '../geo';
import { titleOf } from '../store';
import type { GeoPoint, Note, Settings } from '../types';
import { IconBook, IconBookmark, IconClose, IconGear, IconPin, IconPlus } from './icons';

type Filter = 'all' | 'bookmarked' | 'nearby';

interface Props {
  notes: Note[];
  settings: Settings;
  position: GeoPoint | null;
  currentId: string | null;
  onOpen: (n: Note) => void;
  onNew: () => void;
  onClose: () => void;
  onCloseBook: () => void;
  onSettings: () => void;
}

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

function when(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const days = Math.round((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 864e5);
  if (days === 0) return timeFmt.format(d);
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return dayFmt.format(d);
}

export function NotesList(p: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const hand = handOf(p.settings.font);

  const rows = useMemo(() => {
    let list = p.notes.map((n) => ({ n, d: p.position && n.loc ? distance(p.position, n.loc) : null }));
    if (filter === 'bookmarked') list = list.filter((r) => r.n.bookmarked);
    if (filter === 'nearby') list = list.filter((r) => r.d !== null && r.d <= NEARBY_M).sort((a, b) => a.d! - b.d!);
    else list.sort((a, b) => b.n.updated - a.n.updated);
    return list;
  }, [p.notes, p.position, filter]);

  const nearbyCount = p.position ? p.notes.filter((n) => n.loc && distance(p.position!, n.loc) <= NEARBY_M).length : 0;

  return (
    <div class="list-view" role="dialog" aria-label="My notes">
      <header class="list-head">
        <button class="icon-btn" onClick={p.onClose} aria-label="Back to page">
          <IconClose />
        </button>
        <h1>{p.settings.name ? `${p.settings.name}’s notes` : 'My notes'}</h1>
        <button class="icon-btn" onClick={p.onSettings} aria-label="Settings">
          <IconGear />
        </button>
      </header>

      <div class="chips" role="tablist">
        <button role="tab" aria-selected={filter === 'all'} class={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          All <span>{p.notes.length}</span>
        </button>
        <button role="tab" aria-selected={filter === 'bookmarked'} class={filter === 'bookmarked' ? 'on' : ''} onClick={() => setFilter('bookmarked')}>
          <IconBookmark size={15} filled /> Bookmarked
        </button>
        {p.settings.useLocation && (
          <button role="tab" aria-selected={filter === 'nearby'} class={filter === 'nearby' ? 'on' : ''} onClick={() => setFilter('nearby')}>
            <IconPin size={15} /> Near you <span>{nearbyCount}</span>
          </button>
        )}
      </div>

      <ul class="rows">
        {rows.map(({ n, d }) => (
          <li key={n.id}>
            <button class={`row ${n.id === p.currentId ? 'current' : ''}`} onClick={() => p.onOpen(n)}>
              <span class="row-title" style={{ fontFamily: cssFamily(hand) }}>
                {titleOf(n)}
              </span>
              <span class="row-meta">
                {when(n.updated)}
                {d !== null && (
                  <>
                    {' · '}
                    <IconPin size={12} /> {fmtDistance(d)}
                  </>
                )}
                {n.strokes.length > 0 && ' · drawing'}
              </span>
              {n.bookmarked && (
                <span class="row-mark" aria-label="Bookmarked">
                  <IconBookmark size={16} filled />
                </span>
              )}
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li class="empty">
            {filter === 'all' && 'Nothing written yet. Start a page and tap anywhere to type.'}
            {filter === 'bookmarked' && 'No bookmarks. Tap the bookmark on a page to keep it here.'}
            {filter === 'nearby' && (p.position ? 'No notes within 300 m of here.' : 'Location is off, or not allowed for this app.')}
          </li>
        )}
      </ul>

      <footer class="list-foot">
        <button class="ghost-btn" onClick={p.onCloseBook}>
          <IconBook size={18} /> Close notebook
        </button>
        <button class="primary-btn" onClick={p.onNew}>
          <IconPlus size={18} /> New page
        </button>
      </footer>
    </div>
  );
}
