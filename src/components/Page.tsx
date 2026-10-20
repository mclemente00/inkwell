import { memo } from 'preact/compat';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { cssFamily, jitter, wrap } from '../fonts';
import { ERASER_R, hitStroke, paintStroke } from '../draw';
import { MARGIN_L, PAGE_W, TOP_ROWS } from '../paper';
import { blockLines, blockWidth, patternCss, placeAt, resolveColor, rowTop, type Layout } from '../layout';
import { uid } from '../store';
import type { Note, Stroke, TextBlock, Tool } from '../types';

export type PageMode = 'type' | 'draw' | 'static';

interface Props {
  note: Note;
  lay: Layout;
  scale: number;
  height: number;
  mode: PageMode;
  tool?: Tool;
  color?: string;
  scroller?: { current: HTMLElement | null };
  onBlocks?: (blocks: TextBlock[]) => void;
  onStroke?: (s: Stroke) => void;
  onErase?: (ids: string[]) => void;
  onSwipe?: (dir: 'next' | 'prev') => void;
  onEditing?: (editing: boolean) => void;
  /** Changes whenever the visible area changes (keyboard opening, closing, panning). */
  viewportTick?: number;
}

/** Keep big canvases inside what mobile Safari will allocate. */
function canvasDpr(w: number, h: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  return Math.min(dpr, Math.sqrt(14e6 / Math.max(1, w * h)));
}

const TextView = memo(function TextView({ b, lay, hidden }: { b: TextBlock; lay: Layout; hidden: boolean }) {
  const lines = blockLines(b, lay);
  let n = 0;
  return (
    <div
      class="tb"
      data-id={b.id}
      style={{
        left: b.x,
        top: rowTop(b.y, lay.L) + lay.shift,
        width: blockWidth(b),
        fontFamily: cssFamily(lay.hand),
        fontSize: lay.fontSize,
        lineHeight: `${lay.L}px`,
        color: lay.ink,
        visibility: hidden ? 'hidden' : undefined,
      }}
    >
      {lines.map((line, li) => (
        <div class="tl" key={li}>
          {[...line].map((ch) => {
            const j = jitter(b.id, n++);
            return (
              <span style={{ transform: `translateY(${j.dy}px) rotate(${j.rot}deg)` }}>{ch}</span>
            );
          })}
          {line === '' ? '​' : null}
        </div>
      ))}
    </div>
  );
});

export function Page(props: Props) {
  const { note, lay, scale, height, mode } = props;
  const pageRef = useRef<HTMLDivElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const editingRef = useRef<string | null>(null);
  const blocksRef = useRef(note.blocks);
  blocksRef.current = note.blocks;

  const dpr = canvasDpr(PAGE_W * scale, height * scale);

  // Committed ink.
  useLayoutEffect(() => {
    const c = inkRef.current;
    if (!c) return;
    c.width = Math.round(PAGE_W * scale * dpr);
    c.height = Math.round(height * scale * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    ctx.clearRect(0, 0, PAGE_W, height);
    for (const s of note.strokes) if (!hidden.has(s.id)) paintStroke(ctx, { ...s, color: resolveColor(s.color, lay) });
  }, [note.strokes, scale, height, dpr, hidden, lay]);

  useLayoutEffect(() => {
    const c = liveRef.current;
    if (!c) return;
    c.width = Math.round(PAGE_W * scale * dpr);
    c.height = Math.round(height * scale * dpr);
  }, [scale, height, dpr, mode]);

  // Leaving type mode ends any edit.
  useEffect(() => {
    if (mode !== 'type' && editingRef.current) finishEdit();
  }, [mode]);

  // A block that vanished from the note (undo, page change) can't stay in edit.
  useEffect(() => {
    if (editing && !note.blocks.some((b) => b.id === editing)) {
      editingRef.current = null;
      setEditing(null);
      props.onEditing?.(false);
    }
  }, [note.blocks, editing]);

  const toUnits = (e: { clientX: number; clientY: number }) => {
    const r = pageRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };

  // ---------- typing ----------

  function placeTextarea(b: TextBlock) {
    const ta = taRef.current!;
    ta.style.left = `${b.x}px`;
    ta.style.top = `${rowTop(b.y, lay.L) + lay.shift}px`;
    ta.style.width = `${blockWidth(b)}px`;
    fitTextarea(b);
  }

  /**
   * Size the typing box to exactly the text's lines. Rounding scrollHeight up made it a line too tall,
   * so a tap on the line below landed in the box instead of starting a new line.
   */
  function fitTextarea(target?: TextBlock) {
    const ta = taRef.current!;
    const b = target ?? blocksRef.current.find((x) => x.id === editingRef.current);
    let rows = b ? wrap(lay.hand, lay.fontSize, ta.value, blockWidth(b)).length : 1;
    // The browser may wrap a little differently from our measurement; never clip a real extra line.
    ta.style.height = '0px';
    if (ta.scrollHeight > (rows + 0.5) * lay.L) rows += 1;
    ta.style.height = `${Math.max(1, rows) * lay.L}px`;
  }

  function dropIfEmpty(id: string | null, blocks = blocksRef.current) {
    if (!id) return blocks;
    const b = blocks.find((x) => x.id === id);
    if (b && !b.text.trim()) {
      const next = blocks.filter((x) => x.id !== id);
      props.onBlocks?.(next);
      return next;
    }
    return blocks;
  }

  /** Must run inside the tap's event handler, or iOS won't raise the keyboard. */
  function beginEdit(b: TextBlock, isNew: boolean) {
    const ta = taRef.current!;
    let blocks = dropIfEmpty(editingRef.current === b.id ? null : editingRef.current);
    if (isNew) {
      blocks = [...blocks, b];
      props.onBlocks?.(blocks);
    }
    ta.value = b.text;
    placeTextarea(b);
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(b.text.length, b.text.length);
    editingRef.current = b.id;
    setEditing(b.id);
    props.onEditing?.(true);
    // If the keyboard is already up this lands straight away; if not, the viewport change does it.
    setTimeout(() => revealCaret(true), 60);
  }

  /** Scroll so the line being typed on sits above the keyboard, with a line of breathing room. */
  function revealCaret(smooth = false) {
    const ta = taRef.current;
    const sc = props.scroller?.current;
    const b = blocksRef.current.find((x) => x.id === editingRef.current);
    if (!ta || !sc || !b || !pageRef.current) return;
    // iOS sometimes pans the whole app up for the keyboard; keep it put and scroll the page instead.
    if (window.scrollY) window.scrollTo(0, 0);
    const before = ta.value.slice(0, ta.selectionEnd ?? ta.value.length);
    const line = Math.max(0, wrap(lay.hand, lay.fontSize, before, blockWidth(b)).length - 1);
    const pageTop = pageRef.current.getBoundingClientRect().top;
    const lineTop = pageTop + (rowTop(b.y, lay.L) + line * lay.L) * scale;
    const lineBottom = lineTop + lay.L * scale;
    const vv = window.visualViewport;
    const visTop = sc.getBoundingClientRect().top;
    const visBottom = Math.min(sc.getBoundingClientRect().bottom, vv ? vv.offsetTop + vv.height : innerHeight);
    const room = lay.L * scale;
    let dy = 0;
    if (lineBottom + room > visBottom) dy = lineBottom + room - visBottom;
    else if (lineTop - room / 2 < visTop) dy = lineTop - room / 2 - visTop;
    if (Math.abs(dy) > 1) sc.scrollBy({ top: dy, behavior: smooth ? 'smooth' : 'auto' });
  }

  useEffect(() => {
    if (editingRef.current) revealCaret(true);
  }, [props.viewportTick]);

  function finishEdit() {
    const id = editingRef.current;
    editingRef.current = null;
    setEditing(null);
    // Leaving an edit drops trailing blank lines, so a stray tap below doesn't grow the block.
    const b = blocksRef.current.find((x) => x.id === id);
    if (b && b.text.trim() && /\s$/.test(b.text)) {
      blocksRef.current = blocksRef.current.map((x) => (x.id === id ? { ...x, text: x.text.replace(/\s+$/, '') } : x));
      props.onBlocks?.(blocksRef.current);
    }
    dropIfEmpty(id);
    props.onEditing?.(false);
    if (document.activeElement === taRef.current) taRef.current?.blur();
  }

  function onInput() {
    const id = editingRef.current;
    if (!id) return;
    const text = taRef.current!.value;
    fitTextarea();
    props.onBlocks?.(blocksRef.current.map((b) => (b.id === id ? { ...b, text } : b)));
    requestAnimationFrame(() => revealCaret());
  }

  function onBlur() {
    // Taps on the page refocus synchronously; only a real blur ends the edit.
    setTimeout(() => {
      if (document.activeElement !== taRef.current && editingRef.current) finishEdit();
      // iOS home-screen apps can stay scrolled up after the keyboard closes; put the viewport back.
      if (document.activeElement?.tagName !== 'TEXTAREA') window.scrollTo(0, 0);
    }, 0);
  }

  // Keep the textarea glued to its block when layout settings change.
  useLayoutEffect(() => {
    const b = note.blocks.find((x) => x.id === editing);
    if (b && taRef.current) placeTextarea(b);
  }, [lay, editing]);

  const swipe = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const swallowClick = useRef(false);

  function onPagePointerDown(e: PointerEvent) {
    if (mode !== 'type') return;
    swipe.current = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
    // Stop the browser blurring the textarea before our click handler refocuses it.
    if (editingRef.current && e.target !== taRef.current && e.pointerType !== 'mouse') e.preventDefault();
  }

  function onPagePointerUp(e: PointerEvent) {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId || mode !== 'type') return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 60 && performance.now() - s.t < 700) {
      swallowClick.current = true;
      if (editingRef.current) finishEdit();
      props.onSwipe?.(dx < 0 ? 'next' : 'prev');
    }
  }

  function onPageClick(e: MouseEvent) {
    if (mode !== 'type') return;
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    const t = e.target as HTMLElement;
    if (t === taRef.current || t.closest('.grip')) return;
    const hit = t.closest<HTMLElement>('.tb');
    if (hit) {
      const b = note.blocks.find((x) => x.id === hit.dataset.id);
      if (b) return beginEdit(b, false);
    }
    const p = toUnits(e);
    const at = placeAt(p.x, p.y, lay.L);
    // Tapping just below a block continues it instead of starting a new one.
    const above = note.blocks.find((b) => {
      const top = rowTop(b.y, lay.L);
      const bottom = top + blockLines(b, lay).length * lay.L;
      return Math.abs(b.x - at.x) < 24 && (at.y >= top && at.y <= bottom);
    });
    if (above) {
      // A tap on the line just below the text starts a new line in it, not more text on the last one.
      const bottom = rowTop(above.y, lay.L) + blockLines(above, lay).length * lay.L;
      if (at.y >= bottom && above.text.trim()) {
        const next = { ...above, text: above.text.replace(/\s+$/, '') + '\n' };
        blocksRef.current = blocksRef.current.map((x) => (x.id === next.id ? next : x));
        props.onBlocks?.(blocksRef.current);
        return beginEdit(next, false);
      }
      return beginEdit(above, false);
    }
    beginEdit({ id: uid(), x: at.x, y: at.y, text: '' }, true);
  }

  // Dragging the grip moves the block being edited.
  const drag = useRef<{ id: string; ox: number; oy: number } | null>(null);
  function onGripDown(e: PointerEvent) {
    const b = note.blocks.find((x) => x.id === editingRef.current);
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toUnits(e);
    drag.current = { id: b.id, ox: p.x - b.x, oy: p.y - rowTop(b.y, lay.L) };
  }
  function onGripMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const p = toUnits(e);
    const x = Math.round(Math.max(MARGIN_L - 18, Math.min(PAGE_W - 80, p.x - d.ox)));
    const y = Math.max(TOP_ROWS, Math.round((p.y - d.oy) / lay.L)) * lay.L;
    const blocks = blocksRef.current.map((b) => (b.id === d.id ? { ...b, x, y } : b));
    props.onBlocks?.(blocks);
    const b = blocks.find((x) => x.id === d.id)!;
    placeTextarea(b);
  }
  function onGripUp() {
    drag.current = null;
    taRef.current?.focus({ preventScroll: true });
  }

  // ---------- drawing ----------

  const live = useRef<{ id: number; points: number[]; bbox: number[] } | null>(null);
  const erasing = useRef<Set<string> | null>(null);
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const penSeen = useRef(false);
  const panY = useRef<number | null>(null);

  const liveCtx = () => {
    const ctx = liveRef.current!.getContext('2d')!;
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    return ctx;
  };

  function clearLive() {
    const ctx = liveCtx();
    ctx.clearRect(0, 0, PAGE_W, height);
  }

  function drawLive(last = false) {
    const l = live.current;
    if (!l) return;
    const ctx = liveCtx();
    const [x0, y0, x1, y1] = l.bbox;
    ctx.clearRect(x0 - 20, y0 - 20, x1 - x0 + 40, y1 - y0 + 40);
    paintStroke(ctx, { tool: props.tool as Stroke['tool'], color: resolveColor(props.color!, lay), points: l.points }, last);
  }

  function eraseAt(x: number, y: number) {
    const set = erasing.current!;
    let changed = false;
    for (const s of note.strokes) {
      if (!set.has(s.id) && hitStroke(s, x, y)) {
        set.add(s.id);
        changed = true;
      }
    }
    if (changed) setHidden(new Set(set));
    const ctx = liveCtx();
    ctx.clearRect(0, 0, PAGE_W, height);
    ctx.strokeStyle = lay.paper.dark ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.35)';
    ctx.lineWidth = 1 / scale;
    ctx.beginPath();
    ctx.arc(x, y, ERASER_R, 0, Math.PI * 2);
    ctx.stroke();
  }

  function onDrawDown(e: PointerEvent) {
    e.preventDefault();
    if (e.pointerType === 'pen') penSeen.current = true;
    if (e.pointerType === 'touch') {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      // Two fingers, or a finger once a stylus is in use, scroll the page.
      if (touches.current.size >= 2 || penSeen.current) {
        if (live.current) {
          live.current = null;
          clearLive();
        }
        if (erasing.current) {
          erasing.current = null;
          setHidden(new Set());
          clearLive();
        }
        panY.current = avgY();
        return;
      }
    }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const p = toUnits(e);
    if (props.tool === 'eraser') {
      erasing.current = new Set();
      live.current = { id: e.pointerId, points: [], bbox: [] };
      eraseAt(p.x, p.y);
      return;
    }
    const pr = e.pointerType === 'pen' ? e.pressure || 0.5 : 0.5;
    live.current = { id: e.pointerId, points: [p.x, p.y, pr], bbox: [p.x, p.y, p.x, p.y] };
    drawLive();
  }

  const avgY = () => {
    let s = 0;
    for (const t of touches.current.values()) s += t.y;
    return s / Math.max(1, touches.current.size);
  };

  function onDrawMove(e: PointerEvent) {
    if (e.pointerType === 'touch' && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (panY.current !== null) {
        const y = avgY();
        props.scroller?.current?.scrollBy(0, panY.current - y);
        panY.current = y;
        return;
      }
    }
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    const evs = (e as PointerEvent).getCoalescedEvents?.() ?? [e];
    for (const ev of evs.length ? evs : [e]) {
      const p = toUnits(ev);
      if (props.tool === 'eraser') {
        eraseAt(p.x, p.y);
        continue;
      }
      const pr = ev.pointerType === 'pen' ? ev.pressure || 0.5 : 0.5;
      l.points.push(p.x, p.y, pr);
      l.bbox = [Math.min(l.bbox[0], p.x), Math.min(l.bbox[1], p.y), Math.max(l.bbox[2], p.x), Math.max(l.bbox[3], p.y)];
    }
    if (props.tool !== 'eraser') drawLive();
  }

  function onDrawUp(e: PointerEvent) {
    touches.current.delete(e.pointerId);
    if (touches.current.size === 0) panY.current = null;
    else if (panY.current !== null) panY.current = avgY();
    const l = live.current;
    if (!l || l.id !== e.pointerId) return;
    live.current = null;
    if (props.tool === 'eraser') {
      const ids = [...(erasing.current ?? [])];
      erasing.current = null;
      clearLive();
      if (ids.length) props.onErase?.(ids);
      setHidden(new Set());
      return;
    }
    clearLive();
    if (l.points.length >= 3) {
      props.onStroke?.({ id: uid(), tool: props.tool as Stroke['tool'], color: props.color!, points: l.points.map((v) => Math.round(v * 100) / 100) });
    }
  }

  const editBlock = note.blocks.find((b) => b.id === editing);
  const pattern = patternCss(lay);
  const pageStyle: JSX.CSSProperties = {
    width: PAGE_W,
    height,
    transform: `scale(${scale})`,
    background: lay.paper.bg,
  };

  return (
    <div class="page-outer" style={{ width: PAGE_W * scale, height: height * scale }}>
      <div
        ref={pageRef}
        class={`page mode-${mode}`}
        style={pageStyle}
        onPointerDown={onPagePointerDown}
        onPointerUp={onPagePointerUp}
        onClick={onPageClick}
      >
        <div class="pattern" style={{ ...pattern, top: Math.max(0, TOP_ROWS - 1) * lay.L }} />
        {lay.style === 'lined' && <div class="margin-rule" style={{ left: MARGIN_L - 7, background: lay.paper.margin }} />}
        {note.blocks.map((b) => (
          <TextView key={b.id} b={b} lay={lay} hidden={b.id === editing} />
        ))}
        {mode !== 'static' && (
          <textarea
            ref={taRef}
            class="ta"
            aria-label="Note text"
            autocapitalize="sentences"
            spellcheck={false}
            tabIndex={editing ? 0 : -1}
            style={{
              fontFamily: cssFamily(lay.hand),
              fontSize: lay.fontSize,
              lineHeight: `${lay.L}px`,
              color: lay.ink,
              caretColor: lay.ink,
              opacity: editing ? 1 : 0,
              pointerEvents: editing ? 'auto' : 'none',
            }}
            onInput={onInput}
            onBlur={onBlur}
          />
        )}
        {editBlock && mode === 'type' && (
          <div
            class="grip"
            title="Drag to move"
            style={{ left: editBlock.x - 20, top: rowTop(editBlock.y, lay.L) + lay.L * 0.15, height: lay.L * 0.7 }}
            onPointerDown={onGripDown}
            onPointerMove={onGripMove}
            onPointerUp={onGripUp}
            onPointerCancel={onGripUp}
          />
        )}
        <canvas ref={inkRef} class="ink" style={{ width: PAGE_W, height }} />
        {mode === 'draw' && (
          <canvas
            ref={liveRef}
            class="live"
            style={{ width: PAGE_W, height }}
            onPointerDown={onDrawDown}
            onPointerMove={onDrawMove}
            onPointerUp={onDrawUp}
            onPointerCancel={onDrawUp}
          />
        )}
      </div>
    </div>
  );
}
