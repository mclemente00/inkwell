import { useMemo, useRef, useState } from 'preact/hooks';
import { cssFamily, handOf } from '../fonts';
import { distance, fmtDistance, NEARBY_M } from '../geo';
import { titleOf } from '../store';
import type { GeoPoint, Note, Settings } from '../types';
import { IconBook, IconBookmark, IconClose, IconGear, IconPin, IconPlus } from './icons';

type Filter = 'all' | 'bookmarked' | 'nearby';

interface Props {
  /** Saved notes in notebook order. */
  notes: Note[];
  settings: Settings;
  position: GeoPoint | null;
  currentId: string | null;
  onOpen: (n: Note) => void;
  onNew: () => void;
  onClose: () => void;
  onCloseBook: () => void;
  onSettings: () => void;
  onReorder: (ids: string[]) => void;
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

const move = (ids: string[], id: string, to: number) => {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(rest.length, to)), 0, id);
  return rest;
};

export function NotesList(p: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [draft, setDraft] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; offset: number } | null>(null);
  const dragRef = useRef<{ id: string; pointer: number; startY: number; startScroll: number; from: number; rowH: number; snapshot: string[] } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const hand = handOf(p.settings.font);
  const reordering = draft !== null;

  const pageNo = useMemo(() => new Map(p.notes.map((n, i) => [n.id, i + 1])), [p.notes]);

  const rows = useMemo(() => {
    let list = p.notes.map((n) => ({ n, d: p.position && n.loc ? distance(p.position, n.loc) : null }));
    if (filter === 'bookmarked') list = list.filter((r) => r.n.bookmarked);
    if (filter === 'nearby') list = list.filter((r) => r.d !== null && r.d <= NEARBY_M).sort((a, b) => a.d! - b.d!);
    return list;
  }, [p.notes, p.position, filter]);

  const byId = useMemo(() => new Map(p.notes.map((n) => [n.id, n])), [p.notes]);
  const nearbyCount = p.position ? p.notes.filter((n) => n.loc && distance(p.position!, n.loc) <= NEARBY_M).length : 0;

  function startReorder() {
    setFilter('all');
    setDraft(p.notes.map((n) => n.id));
  }

  function finishReorder() {
    if (draft && draft.some((id, i) => id !== p.notes[i]?.id)) p.onReorder(draft);
    setDraft(null);
    setDrag(null);
  }

  // ---------- dragging a page by its handle ----------

  function onHandleDown(e: PointerEvent, id: string) {
    if (!draft) return;
    e.preventDefault();
    const li = (e.currentTarget as HTMLElement).closest('li')!;
    const next = li.nextElementSibling as HTMLElement | null;
    const prev = li.previousElementSibling as HTMLElement | null;
    const rowH = next ? next.offsetTop - li.offsetTop : prev ? li.offsetTop - prev.offsetTop : li.offsetHeight + 8;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      id,
      pointer: e.pointerId,
      startY: e.clientY,
      startScroll: listRef.current?.scrollTop ?? 0,
      from: draft.indexOf(id),
      rowH,
      snapshot: draft,
    };
    setDrag({ id, offset: 0 });
  }

  function onHandleMove(e: PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointer !== e.pointerId) return;
    const list = listRef.current!;
    // Near the top or bottom edge, scroll the list so long notebooks can be reordered too.
    const box = list.getBoundingClientRect();
    if (e.clientY < box.top + 50) list.scrollTop -= 10;
    else if (e.clientY > box.bottom - 50) list.scrollTop += 10;
    const dy = e.clientY - d.startY + (list.scrollTop - d.startScroll);
    const to = Math.max(0, Math.min(d.snapshot.length - 1, d.from + Math.round(dy / d.rowH)));
    setDraft(move(d.snapshot, d.id, to));
    // The lifted row follows the finger, but only about half a row past its slot, so it can't slide
    // under the header or off the end of the list.
    const offset = Math.max(-d.rowH / 2, Math.min(d.rowH / 2, dy - (to - d.from) * d.rowH));
    setDrag({ id: d.id, offset });
  }

  function onHandleUp(e: PointerEvent) {
    if (dragRef.current?.pointer !== e.pointerId) return;
    dragRef.current = null;
    setDrag(null);
  }

  function onHandleKey(e: KeyboardEvent, id: string) {
    if (!draft || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = draft.indexOf(id);
    setDraft(move(draft, id, e.key === 'ArrowUp' ? i - 1 : i + 1));
  }

  const shown = reordering ? draft!.map((id) => ({ n: byId.get(id)!, d: null as number | null })).filter((r) => r.n) : rows;

  return (
    <div class={`list-view ${reordering ? 'reordering' : ''}`} role="dialog" aria-label="My notes">
      <header class="list-head">
        <button class="icon-btn" onClick={p.onClose} aria-label="Back to page" disabled={reordering}>
          <IconClose />
        </button>
        <h1>{p.settings.name ? `${p.settings.name}’s notes` : 'My notes'}</h1>
        <button class="icon-btn" onClick={p.onSettings} aria-label="Settings" disabled={reordering}>
          <IconGear />
        </button>
      </header>

      <div class="chips" role="tablist">
        {reordering ? (
          <span class="reorder-hint">Drag the handles to change the page order.</span>
        ) : (
          <>
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
          </>
        )}
        {p.notes.length > 1 && (
          <button class={`chip-action ${reordering ? 'on' : ''}`} onClick={reordering ? finishReorder : startReorder}>
            {reordering ? 'Done' : 'Reorder'}
          </button>
        )}
      </div>

      <ul class="rows" ref={listRef}>
        {shown.map(({ n, d }, i) => {
          const dragging = drag?.id === n.id;
          return (
            <li key={n.id} class={dragging ? 'dragging' : ''} style={dragging ? { transform: `translateY(${drag!.offset}px)` } : undefined}>
              <div class={`row ${n.id === p.currentId ? 'current' : ''}`}>
                <button class="row-main" onClick={() => !reordering && p.onOpen(n)} tabIndex={reordering ? -1 : 0}>
                  <span class="row-title" style={{ fontFamily: cssFamily(hand) }}>
                    {titleOf(n)}
                  </span>
                  <span class="row-meta">
                    Page {reordering ? i + 1 : pageNo.get(n.id)}
                    {' · '}
                    {when(n.updated)}
                    {d !== null && (
                      <>
                        {' · '}
                        <IconPin size={12} /> {fmtDistance(d)}
                      </>
                    )}
                    {n.strokes.length > 0 && ' · drawing'}
                  </span>
                </button>
                {reordering ? (
                  <button
                    class="row-handle"
                    aria-label={`Move “${titleOf(n)}”. Use the arrow keys or drag.`}
                    onPointerDown={(e) => onHandleDown(e, n.id)}
                    onPointerMove={onHandleMove}
                    onPointerUp={onHandleUp}
                    onPointerCancel={onHandleUp}
                    onKeyDown={(e) => onHandleKey(e, n.id)}
                  >
                    <span aria-hidden="true" />
                  </button>
                ) : (
                  n.bookmarked && (
                    <span class="row-mark" aria-label="Bookmarked">
                      <IconBookmark size={16} filled />
                    </span>
                  )
                )}
              </div>
            </li>
          );
        })}
        {shown.length === 0 && (
          <li class="empty">
            {filter === 'all' && 'Nothing written yet. Start a page and tap anywhere to type.'}
            {filter === 'bookmarked' && 'No bookmarks. Tap the bookmark on a page to keep it here.'}
            {filter === 'nearby' && (p.position ? 'No notes within 300 m of here.' : 'Location is off, or not allowed for this app.')}
          </li>
        )}
      </ul>

      {!reordering && (
        <footer class="list-foot">
          <button class="ghost-btn" onClick={p.onCloseBook}>
            <IconBook size={18} /> Close notebook
          </button>
          <button class="primary-btn" onClick={p.onNew}>
            <IconPlus size={18} /> New page
          </button>
        </footer>
      )}
    </div>
  );
}
