import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cssFamily, handOf } from '../fonts';
import { distance, fmtDistance, NEARBY_M } from '../geo';
import { titleOf } from '../store';
import type { GeoPoint, Note, Settings } from '../types';
import { IconBook, IconBookmark, IconClose, IconGear, IconPin, IconPlus, IconTrash } from './icons';
import { usePullToDismiss } from './pull';

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
  onDelete: (n: Note) => void;
  onToggleBookmark: (n: Note) => void;
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

/** How long to hold a page before it lifts for dragging. */
const HOLD_MS = 380;

interface Drag {
  id: string;
  pointer: number;
  startY: number;
  startScroll: number;
  from: number;
  rowH: number;
  snapshot: string[];
  latest: string[];
  /** Started by holding a row outside Reorder mode: the new order is saved on release. */
  instant: boolean;
}

/** One touch on a row, until we know whether it's a tap, a scroll, a swipe or a hold. */
interface Touch {
  id: string;
  pointer: number;
  x0: number;
  y0: number;
  mode: 'pending' | 'swipe' | 'scroll' | 'drag';
  timer?: number;
  li: HTMLElement;
  width: number;
}

export function NotesList(p: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [draft, setDraft] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; offset: number } | null>(null);
  const [swipe, setSwipe] = useState<{ id: string; dx: number; settling?: boolean } | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const touchRef = useRef<Touch | null>(null);
  const swallowClick = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const pull = usePullToDismiss(p.onClose);
  const hand = handOf(p.settings.font);
  const reordering = draft !== null && !dragRef.current?.instant;

  const pageNo = useMemo(() => new Map(p.notes.map((n, i) => [n.id, i + 1])), [p.notes]);

  const rows = useMemo(() => {
    let list = p.notes.map((n) => ({ n, d: p.position && n.loc ? distance(p.position, n.loc) : null }));
    if (filter === 'bookmarked') list = list.filter((r) => r.n.bookmarked);
    if (filter === 'nearby') list = list.filter((r) => r.d !== null && r.d <= NEARBY_M).sort((a, b) => a.d! - b.d!);
    return list;
  }, [p.notes, p.position, filter]);

  const byId = useMemo(() => new Map(p.notes.map((n) => [n.id, n])), [p.notes]);
  const nearbyCount = p.position ? p.notes.filter((n) => n.loc && distance(p.position!, n.loc) <= NEARBY_M).length : 0;

  // While a page is lifted, stop iOS from scrolling the list under the finger.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const block = (e: TouchEvent) => dragRef.current && e.preventDefault();
    list.addEventListener('touchmove', block, { passive: false });
    return () => list.removeEventListener('touchmove', block);
  }, []);

  function startReorder() {
    setFilter('all');
    setDraft(p.notes.map((n) => n.id));
  }

  function finishReorder() {
    if (draft && draft.some((id, i) => id !== p.notes[i]?.id)) p.onReorder(draft);
    setDraft(null);
    setDrag(null);
  }

  // ---------- dragging (by the handle in Reorder mode, or by holding a row) ----------

  function beginDrag(id: string, li: HTMLElement, pointer: number, clientY: number, instant: boolean) {
    const order = draft ?? p.notes.map((n) => n.id);
    const next = li.nextElementSibling as HTMLElement | null;
    const prev = li.previousElementSibling as HTMLElement | null;
    const rowH = next ? next.offsetTop - li.offsetTop : prev ? li.offsetTop - prev.offsetTop : li.offsetHeight + 8;
    dragRef.current = {
      id,
      pointer,
      startY: clientY,
      startScroll: listRef.current?.scrollTop ?? 0,
      from: order.indexOf(id),
      rowH,
      snapshot: order,
      latest: order,
      instant,
    };
    if (!draft) setDraft(order);
    setDrag({ id, offset: 0 });
    navigator.vibrate?.(8);
  }

  function dragMove(e: PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointer !== e.pointerId) return;
    const list = listRef.current!;
    // Near the top or bottom edge, scroll the list so long notebooks can be reordered too.
    const box = list.getBoundingClientRect();
    if (e.clientY < box.top + 50) list.scrollTop -= 10;
    else if (e.clientY > box.bottom - 50) list.scrollTop += 10;
    const dy = e.clientY - d.startY + (list.scrollTop - d.startScroll);
    const to = Math.max(0, Math.min(d.snapshot.length - 1, d.from + Math.round(dy / d.rowH)));
    d.latest = move(d.snapshot, d.id, to);
    setDraft(d.latest);
    // The lifted row follows the finger, but only about half a row past its slot, so it can't slide
    // under the header or off the end of the list.
    const offset = Math.max(-d.rowH / 2, Math.min(d.rowH / 2, dy - (to - d.from) * d.rowH));
    setDrag({ id: d.id, offset });
  }

  function dragEnd() {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    setDrag(null);
    if (d.instant) {
      if (d.latest.some((id, i) => id !== p.notes[i]?.id)) p.onReorder(d.latest);
      setDraft(null);
    }
  }

  function onHandleDown(e: PointerEvent, id: string) {
    if (!draft) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    beginDrag(id, (e.currentTarget as HTMLElement).closest('li')!, e.pointerId, e.clientY, false);
  }

  function onHandleKey(e: KeyboardEvent, id: string) {
    if (!draft || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = draft.indexOf(id);
    setDraft(move(draft, id, e.key === 'ArrowUp' ? i - 1 : i + 1));
  }

  // ---------- row gestures: hold to drag, swipe for actions ----------

  function onRowDown(e: PointerEvent, n: Note) {
    if (touchRef.current || dragRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // Each touch starts fresh: a drag or swipe that never produced a click mustn't eat the next tap.
    swallowClick.current = false;
    const li = (e.currentTarget as HTMLElement).closest('li')!;
    const t: Touch = { id: n.id, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, mode: 'pending', li, width: li.offsetWidth };
    // Holding still lifts the page, in notebook order only (filtered lists aren't the real order).
    if (filter === 'all') {
      t.timer = window.setTimeout(() => {
        if (touchRef.current !== t || t.mode !== 'pending') return;
        t.mode = 'drag';
        swallowClick.current = true;
        (e.target as HTMLElement).setPointerCapture?.(t.pointer);
        beginDrag(n.id, li, t.pointer, t.y0, !draft);
      }, HOLD_MS);
    }
    touchRef.current = t;
  }

  function onRowMove(e: PointerEvent) {
    const t = touchRef.current;
    if (!t || t.pointer !== e.pointerId) return;
    if (t.mode === 'drag') return dragMove(e);
    const dx = e.clientX - t.x0;
    const dy = e.clientY - t.y0;
    if (t.mode === 'pending') {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3 && !reordering) {
        t.mode = 'swipe';
        window.clearTimeout(t.timer);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > 10 || Math.abs(dx) > 10) {
        t.mode = 'scroll';
        window.clearTimeout(t.timer);
      }
    }
    if (t.mode === 'swipe') {
      // Past 60% of the row the swipe gets heavy, like the row is on a spring.
      const max = t.width * 0.6;
      const r = Math.abs(dx) > max ? Math.sign(dx) * (max + (Math.abs(dx) - max) * 0.25) : dx;
      setSwipe({ id: t.id, dx: r });
    }
  }

  function onRowUp(e: PointerEvent, n: Note) {
    const t = touchRef.current;
    if (!t || t.pointer !== e.pointerId) return;
    touchRef.current = null;
    window.clearTimeout(t.timer);
    if (t.mode === 'drag') return dragEnd();
    if (t.mode !== 'swipe') return;
    swallowClick.current = true;
    const dx = e.clientX - t.x0;
    const threshold = Math.min(110, t.width * 0.3);
    if (dx <= -threshold && e.type === 'pointerup') {
      // Slide the row away, then delete; the toast offers Undo.
      setSwipe({ id: t.id, dx: -t.width, settling: true });
      setTimeout(() => {
        setSwipe(null);
        p.onDelete(n);
      }, 180);
      return;
    }
    if (dx >= threshold && e.type === 'pointerup') p.onToggleBookmark(n);
    setSwipe({ id: t.id, dx: 0, settling: true });
    setTimeout(() => setSwipe((s) => (s?.id === t.id && s.dx === 0 ? null : s)), 200);
  }

  function onRowClick(n: Note) {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    if (!reordering) p.onOpen(n);
  }

  const shown = draft ? draft.map((id) => ({ n: byId.get(id)!, d: null as number | null })).filter((r) => r.n) : rows;

  return (
    <div class={`list-view ${reordering ? 'reordering' : ''}`} role="dialog" aria-label="My notes" style={pull.style}>
      <header class="list-head" {...pull.handlers}>
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
          const sw = swipe?.id === n.id ? swipe : null;
          return (
            <li key={n.id} class={dragging ? 'dragging' : ''} style={dragging ? { transform: `translateY(${drag!.offset}px)` } : undefined}>
              {sw && (
                <div class={`swipe-under ${sw.dx < 0 ? 'delete' : 'mark'}`} aria-hidden="true">
                  {sw.dx < 0 ? (
                    <span>
                      <IconTrash size={20} /> Delete
                    </span>
                  ) : (
                    <span>
                      <IconBookmark size={20} filled={!n.bookmarked} /> {n.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                    </span>
                  )}
                </div>
              )}
              <div
                class={`row ${n.id === p.currentId ? 'current' : ''}`}
                style={sw ? { transform: `translateX(${sw.dx}px)`, transition: sw.settling ? 'transform 180ms ease' : 'none' } : undefined}
                onPointerDown={(e) => onRowDown(e, n)}
                onPointerMove={onRowMove}
                onPointerUp={(e) => onRowUp(e, n)}
                onPointerCancel={(e) => onRowUp(e, n)}
              >
                <button class="row-main" onClick={() => onRowClick(n)} tabIndex={reordering ? -1 : 0}>
                  <span class="row-title" style={{ fontFamily: cssFamily(hand) }}>
                    {titleOf(n)}
                  </span>
                  <span class="row-meta">
                    Page {draft ? i + 1 : pageNo.get(n.id)}
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
                    onPointerMove={dragMove}
                    onPointerUp={dragEnd}
                    onPointerCancel={dragEnd}
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
            {filter === 'bookmarked' && 'No bookmarks. Swipe a page right, or tap the bookmark on a page, to keep it here.'}
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
