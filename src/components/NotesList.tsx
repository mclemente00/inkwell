import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cssFamily, handOf } from '../fonts';
import { distance, fmtDistance, NEARBY_M } from '../geo';
import { autoTitleOf, titleOf } from '../store';
import type { GeoPoint, Note, Settings } from '../types';
import { IconBook, IconBookmark, IconClose, IconGear, IconPen, IconPin, IconPlus, IconTrash } from './icons';
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
  onRename: (n: Note, title: string) => void;
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
/** Width of the Rename + Delete buttons a short left swipe uncovers. */
const ACTIONS_W = 176;

interface Drag {
  id: string;
  pointer: number;
  startY: number;
  startScroll: number;
  from: number;
  rowH: number;
  snapshot: string[];
  latest: string[];
}

/** One touch on a row, until we know whether it's a tap, a scroll, a swipe or a hold. */
interface Touch {
  id: string;
  pointer: number;
  x0: number;
  y0: number;
  /** Where the row sat when the touch began: 0, or open at -ACTIONS_W. */
  base: number;
  mode: 'pending' | 'swipe' | 'scroll' | 'drag';
  timer?: number;
  width: number;
}

export function NotesList(p: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  /** Live order while a page is being dragged; null otherwise. */
  const [draft, setDraft] = useState<string[] | null>(null);
  const [drag, setDrag] = useState<{ id: string; offset: number } | null>(null);
  const [swipe, setSwipe] = useState<{ id: string; dx: number; settling?: boolean } | null>(null);
  /** The row left open by a short left swipe, showing Rename and Delete. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const touchRef = useRef<Touch | null>(null);
  const swallowClick = useRef(false);
  const listRef = useRef<HTMLUListElement>(null);
  const keyboardBridge = useRef<HTMLInputElement>(null);
  const renameInput = useRef<HTMLInputElement>(null);
  const pull = usePullToDismiss(p.onClose);
  const hand = handOf(p.settings.font);

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

  // Hand focus from the keyboard bridge to the title field once it exists, keeping the keyboard up.
  useEffect(() => {
    const el = renameInput.current;
    if (!renamingId || !el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, [renamingId]);

  function closeOpenRow() {
    if (!openId) return;
    setSwipe({ id: openId, dx: 0, settling: true });
    setOpenId(null);
  }

  function startRename(n: Note) {
    // iOS only raises the keyboard for a focus inside the tap itself, and the title field isn't
    // rendered yet; focus a hidden field now and move focus across when the real one mounts.
    keyboardBridge.current?.focus({ preventScroll: true });
    closeOpenRow();
    setRenamingId(n.id);
  }

  function commitRename(n: Note, value: string) {
    if (renamingId !== n.id) return;
    setRenamingId(null);
    // Leaving the first line as it was isn't a name of its own.
    const v = value.trim();
    p.onRename(n, v === autoTitleOf(n) ? '' : v);
  }

  // ---------- holding a row and dragging it ----------

  function beginDrag(id: string, li: HTMLElement, pointer: number, clientY: number) {
    const order = p.notes.map((n) => n.id);
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
    };
    setDraft(order);
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
    setDraft(null);
    if (d.latest.some((id, i) => id !== p.notes[i]?.id)) p.onReorder(d.latest);
  }

  // ---------- row gestures: hold to drag, swipe for actions ----------

  function onRowDown(e: PointerEvent, n: Note) {
    if (renamingId || touchRef.current || dragRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    // Each touch starts fresh: a drag or swipe that never produced a click mustn't eat the next tap.
    swallowClick.current = false;
    // Touching another row while one is open just closes it, like Mail.
    if (openId && openId !== n.id) {
      closeOpenRow();
      swallowClick.current = true;
      return;
    }
    const li = (e.currentTarget as HTMLElement).closest('li')!;
    const t: Touch = {
      id: n.id,
      pointer: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      base: openId === n.id ? -ACTIONS_W : 0,
      mode: 'pending',
      width: li.offsetWidth,
    };
    // Holding still lifts the page, in notebook order only (filtered lists aren't the real order).
    if (filter === 'all' && !openId) {
      t.timer = window.setTimeout(() => {
        if (touchRef.current !== t || t.mode !== 'pending') return;
        t.mode = 'drag';
        swallowClick.current = true;
        (e.target as HTMLElement).setPointerCapture?.(t.pointer);
        beginDrag(n.id, li, t.pointer, t.y0);
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
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        t.mode = 'swipe';
        window.clearTimeout(t.timer);
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } else if (Math.abs(dy) > 10 || Math.abs(dx) > 10) {
        t.mode = 'scroll';
        window.clearTimeout(t.timer);
      }
    }
    if (t.mode === 'swipe') {
      // Past 75% of the row the swipe gets heavy, like the row is on a spring.
      const x = t.base + dx;
      const max = t.width * 0.75;
      const r = Math.abs(x) > max ? Math.sign(x) * (max + (Math.abs(x) - max) * 0.25) : x;
      setSwipe({ id: t.id, dx: r });
    }
  }

  function onRowUp(e: PointerEvent, n: Note) {
    const t = touchRef.current;
    if (!t || t.pointer !== e.pointerId) return;
    touchRef.current = null;
    window.clearTimeout(t.timer);
    if (t.mode === 'drag') return dragEnd();
    if (t.mode !== 'swipe') {
      // A plain tap on the open row closes it instead of opening the page.
      if (t.mode === 'pending' && openId === n.id) {
        swallowClick.current = true;
        closeOpenRow();
      }
      return;
    }
    swallowClick.current = true;
    const x = t.base + (e.clientX - t.x0);
    const cancelled = e.type !== 'pointerup';
    if (!cancelled && x <= -t.width * 0.6) {
      // A long swipe deletes straight away; the toast offers Undo.
      setOpenId(null);
      setSwipe({ id: t.id, dx: -t.width, settling: true });
      setTimeout(() => {
        setSwipe(null);
        p.onDelete(n);
      }, 180);
      return;
    }
    if (!cancelled && x <= -56) {
      // A short swipe leaves the row open on its Rename and Delete buttons.
      setOpenId(n.id);
      setSwipe({ id: t.id, dx: -ACTIONS_W, settling: true });
      return;
    }
    if (!cancelled && x >= Math.min(110, t.width * 0.3)) p.onToggleBookmark(n);
    setOpenId(null);
    setSwipe({ id: t.id, dx: 0, settling: true });
  }

  function onRowClick(n: Note) {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    p.onOpen(n);
  }

  const shown = draft ? draft.map((id) => ({ n: byId.get(id)!, d: null as number | null })).filter((r) => r.n) : rows;

  return (
    <div class="list-view" role="dialog" aria-label="My notes" style={pull.style}>
      <input ref={keyboardBridge} class="keyboard-bridge" aria-hidden="true" tabIndex={-1} />
      <header class="list-head" {...pull.handlers}>
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

      <ul class="rows" ref={listRef}>
        {shown.map(({ n, d }) => {
          const dragging = drag?.id === n.id;
          const sw = swipe?.id === n.id ? swipe : null;
          const renaming = renamingId === n.id;
          return (
            <li
              key={n.id}
              class={dragging ? 'dragging' : ''}
              style={dragging ? { transform: `translateY(${drag!.offset}px)` } : undefined}
              onTransitionEnd={() => sw?.settling && sw.dx === 0 && setSwipe(null)}
            >
              {sw && sw.dx > 0 && (
                <div class="swipe-under mark" aria-hidden="true">
                  <span>
                    <IconBookmark size={20} filled={!n.bookmarked} /> {n.bookmarked ? 'Remove bookmark' : 'Bookmark'}
                  </span>
                </div>
              )}
              {sw && sw.dx < 0 && (
                <div class={`swipe-under actions ${sw.dx <= -(listRef.current?.offsetWidth ?? 400) * 0.6 ? 'deleting' : ''}`}>
                  <button class="swipe-btn rename" onClick={() => startRename(n)} tabIndex={openId === n.id ? 0 : -1}>
                    <IconPen size={20} />
                    Rename
                  </button>
                  <button
                    class="swipe-btn delete"
                    onClick={() => {
                      setOpenId(null);
                      setSwipe(null);
                      p.onDelete(n);
                    }}
                    tabIndex={openId === n.id ? 0 : -1}
                  >
                    <IconTrash size={20} />
                    Delete
                  </button>
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
                {renaming ? (
                  <div class="row-main">
                    <input
                      ref={renameInput}
                      id={`title-${n.id}`}
                      class="row-title row-title-input"
                      style={{ fontFamily: cssFamily(hand) }}
                      type="text"
                      enterKeyHint="done"
                      maxLength={80}
                      aria-label="Page title"
                      placeholder={autoTitleOf(n)}
                      value={n.title ?? autoTitleOf(n)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onBlur={(e) => commitRename(n, (e.currentTarget as HTMLInputElement).value)}
                    />
                    <span class="row-meta">Clear it to use the page’s first line</span>
                  </div>
                ) : (
                  <button class="row-main" onClick={() => onRowClick(n)}>
                    <span class="row-title" style={{ fontFamily: cssFamily(hand) }}>
                      {titleOf(n)}
                    </span>
                    <span class="row-meta">
                      Page {pageNo.get(n.id)}
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
                )}
                {n.bookmarked && !renaming && (
                  <span class="row-mark" aria-label="Bookmarked">
                    <IconBookmark size={16} filled />
                  </span>
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
        {filter === 'all' && shown.length > 1 && (
          <li class="list-tip">Hold a page to move it. Swipe left to rename or delete, right to bookmark.</li>
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
