import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { drawPalette, PAGE_W } from '../paper';
import { layoutFor, pageHeight, resolveColor } from '../layout';
import { shareNote } from '../export';
import { isEmpty, titleOf } from '../store';
import type { Note, PenTool, Settings, Stroke, TextBlock, Tool } from '../types';
import { Page } from './Page';
import {
  IconAa,
  IconBookmark,
  IconCheck,
  IconLeft,
  IconMore,
  IconNotes,
  IconPen,
  IconPlus,
  IconKeyboard,
  IconRedo,
  IconRight,
  IconShare,
  IconTrash,
  IconUndo,
  ToolTip,
} from './icons';

type Op = { kind: 'add'; stroke: Stroke } | { kind: 'erase'; strokes: Stroke[] };

interface Props {
  note: Note;
  /** Saved notes in notebook order. */
  notes: Note[];
  settings: Settings;
  fontsReady: number;
  onChange: (n: Note) => void;
  onNavigate: (target: Note | 'new') => void;
  onList: () => void;
  onCustomize: () => void;
  onDelete: (n: Note) => void;
  toast: (msg: string) => void;
}

const TURN_MS = 620;

export function Book(p: Props) {
  const { note, settings } = p;
  const scroller = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 390, h: 700 });
  const [mode, setMode] = useState<'type' | 'draw'>('type');
  const [tool, setTool] = useState<Tool>('pen');
  // Each instrument remembers its colour token; the marker starts as a highlighter.
  const [colors, setColors] = useState<Record<PenTool, string>>({ pen: 'ink', pencil: 'ink', marker: 'p1' });
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [turn, setTurn] = useState<{ leaf: Note; under: Note; dir: 'next' | 'prev'; target: Note | 'new' } | null>(null);
  const undo = useRef<Op[]>([]);
  const redo = useRef<Op[]>([]);
  const [, bump] = useState(0);

  // fontsReady re-measures the hands once webfonts arrive.
  const lay = useMemo(() => layoutFor(settings), [settings.font, settings.size, settings.paper, settings.ink, settings.pageStyle, p.fontsReady]);
  const penFor = (t: Tool): PenTool => (t === 'eraser' ? 'pen' : t);
  const colorTok = colors[penFor(tool)];
  const palette = ['ink', ...drawPalette(lay.paper.dark).map((_, i) => `p${i}`)];

  useLayoutEffect(() => {
    const el = scroller.current!;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Paint behind the app in the paper colour, so any gap iOS leaves around the viewport blends in.
  useEffect(() => {
    document.documentElement.style.background = lay.paper.bg;
    document.body.style.background = lay.paper.bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', lay.paper.bg);
  }, [lay.paper.bg]);

  // New page, fresh history.
  useEffect(() => {
    undo.current = [];
    redo.current = [];
    setMenu(false);
    setConfirmDel(false);
    bump((x) => x + 1);
  }, [note.id]);

  const scale = Math.min(box.w, 500) / PAGE_W;
  const minH = box.h / scale;
  const height = pageHeight(note, lay, minH);

  const order = p.notes;
  const idx = order.findIndex((n) => n.id === note.id);
  const pos = idx === -1 ? order.length : idx;
  const prev: Note | null = order.at(pos - 1 < 0 ? order.length : pos - 1) ?? null;
  const next: Note | 'new' | null = order.at(pos + 1) ?? (isEmpty(note) ? null : 'new');

  const update = (patch: Partial<Note>) => p.onChange({ ...note, ...patch, updated: Date.now() });

  function go(dir: 'next' | 'prev') {
    if (turn) return;
    const target = dir === 'next' ? next : prev;
    if (!target) return;
    setMode('type');
    const targetNote: Note =
      target === 'new' ? { id: '__turning', created: 0, updated: 0, bookmarked: false, blocks: [], strokes: [] } : target;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return p.onNavigate(target);
    scroller.current!.scrollTop = 0;
    setTurn(dir === 'next' ? { leaf: note, under: targetNote, dir, target } : { leaf: targetNote, under: note, dir, target });
    setTimeout(() => {
      p.onNavigate(target);
      setTurn(null);
    }, TURN_MS);
  }

  function onBlocks(blocks: TextBlock[]) {
    update({ blocks });
  }

  function onStroke(s: Stroke) {
    undo.current.push({ kind: 'add', stroke: s });
    redo.current = [];
    update({ strokes: [...note.strokes, s] });
  }

  function onErase(ids: string[]) {
    const gone = note.strokes.filter((s) => ids.includes(s.id));
    undo.current.push({ kind: 'erase', strokes: gone });
    redo.current = [];
    update({ strokes: note.strokes.filter((s) => !ids.includes(s.id)) });
  }

  function apply(op: Op, reverse: boolean) {
    const adding = (op.kind === 'add') !== reverse;
    const list = op.kind === 'add' ? [op.stroke] : op.strokes;
    const ids = new Set(list.map((s) => s.id));
    update({ strokes: adding ? [...note.strokes.filter((s) => !ids.has(s.id)), ...list] : note.strokes.filter((s) => !ids.has(s.id)) });
  }

  function doUndo() {
    const op = undo.current.pop();
    if (!op) return;
    redo.current.push(op);
    apply(op, true);
  }
  function doRedo() {
    const op = redo.current.pop();
    if (!op) return;
    undo.current.push(op);
    apply(op, false);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== 'draw' || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      e.shiftKey ? doRedo() : doUndo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function share() {
    setMenu(false);
    const name = titleOf(note).slice(0, 40).replace(/[^\w\- ]+/g, '').trim() || 'Inkwell page';
    const r = await shareNote(note, lay, name);
    if (r === 'downloaded') p.toast('Saved the page as an image.');
  }

  const shown = turn ? turn.under : note;

  return (
    <div class={`book ${lay.paper.dark ? 'dark-paper' : ''}`} style={{ '--paper': lay.paper.bg } as Record<string, string>}>
      <header class="topbar">
        <div class="bar-group">
          <button class="icon-btn" onClick={p.onList} aria-label="All notes">
            <IconNotes />
          </button>
          <button class={`icon-btn ${note.bookmarked ? 'accent' : ''}`} onClick={() => update({ bookmarked: !note.bookmarked })} aria-label={note.bookmarked ? 'Remove bookmark' : 'Bookmark this page'} aria-pressed={note.bookmarked}>
            <IconBookmark filled={note.bookmarked} />
          </button>
          <button class="icon-btn" onClick={p.onCustomize} aria-label="Paper, ink and handwriting">
            <IconAa />
          </button>
        </div>
        <div class="bar-group">
          <button class="icon-btn" onClick={() => go('prev')} disabled={!prev} aria-label="Previous page">
            <IconLeft />
          </button>
          <button class="icon-btn" onClick={() => go('next')} disabled={!next} aria-label={next === 'new' ? 'Turn to a new page' : 'Next page'}>
            <IconRight />
          </button>
          <button class="icon-btn" onClick={() => setMenu((m) => !m)} aria-label="More" aria-expanded={menu}>
            <IconMore />
          </button>
          {editing || mode === 'draw' ? (
            <button
              class="round-btn"
              onClick={() => {
                (document.activeElement as HTMLElement | null)?.blur();
                setMode('type');
              }}
              aria-label="Done"
            >
              <IconCheck size={20} />
            </button>
          ) : (
            <button class="round-btn" onClick={() => p.onNavigate('new')} aria-label="New page">
              <IconPlus size={20} />
            </button>
          )}
        </div>
        {menu && (
          <div class="menu" role="menu">
            <button role="menuitem" onClick={share}>
              <IconShare size={18} /> Share as image
            </button>
            {!confirmDel ? (
              <button role="menuitem" class="danger" onClick={() => setConfirmDel(true)}>
                <IconTrash size={18} /> Delete page
              </button>
            ) : (
              <div class="confirm">
                <span>Delete this page for good?</span>
                <div class="btn-row">
                  <button class="ghost-btn" onClick={() => setConfirmDel(false)}>
                    Keep
                  </button>
                  <button
                    class="danger-btn"
                    onClick={() => {
                      setMenu(false);
                      p.onDelete(note);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      <div class={`scroller ${mode === 'draw' ? 'drawing' : ''}`} ref={scroller} onClick={() => menu && setMenu(false)}>
        <div class="desk">
          <Page
            key={shown.id}
            note={shown}
            lay={lay}
            scale={scale}
            height={turn ? pageHeight(shown, lay, minH) : height}
            mode={turn ? 'static' : mode}
            tool={tool}
            color={colorTok}
            scroller={scroller}
            onBlocks={onBlocks}
            onStroke={onStroke}
            onErase={onErase}
            onSwipe={go}
            onEditing={setEditing}
          />
        </div>
        {turn && (
          <div class={`leaf turn-${turn.dir}`} style={{ width: PAGE_W * scale, height: box.h }}>
            <div class="leaf-front">
              <Page note={turn.leaf} lay={lay} scale={scale} height={pageHeight(turn.leaf, lay, minH)} mode="static" />
            </div>
            <div class="leaf-back" />
          </div>
        )}
      </div>

      {mode === 'type' ? (
        <button class="fab" onClick={() => setMode('draw')} aria-label="Draw">
          <IconPen size={24} />
        </button>
      ) : (
        <div class="tray" role="toolbar" aria-label="Drawing tools">
          <div class="tray-tools">
            {(['pen', 'pencil', 'marker', 'eraser'] as Tool[]).map((t) => (
              <button key={t} class={`tool ${tool === t ? 'on' : ''}`} onClick={() => setTool(t)} aria-label={t} aria-pressed={tool === t}>
                <ToolTip tool={t} color={resolveColor(colors[penFor(t)], lay)} />
              </button>
            ))}
          </div>
          <div class="tray-colors">
            {palette.map((c, i) => (
              <button
                key={c}
                class={`dot ${colorTok === c ? 'on' : ''}`}
                style={{ background: resolveColor(c, lay) }}
                aria-label={i === 0 ? 'Notebook ink' : `Colour ${i}`}
                aria-pressed={colorTok === c}
                onClick={() => {
                  setColors((cs) => ({ ...cs, [penFor(tool)]: c }));
                  if (tool === 'eraser') setTool('pen');
                }}
              />
            ))}
          </div>
          <div class="tray-actions">
            <button class="icon-btn" onClick={doUndo} disabled={!undo.current.length} aria-label="Undo">
              <IconUndo />
            </button>
            <button class="icon-btn" onClick={doRedo} disabled={!redo.current.length} aria-label="Redo">
              <IconRedo />
            </button>
            <button class="type-btn" onClick={() => setMode('type')} aria-label="Back to typing">
              <IconKeyboard size={20} />
              <span>Type</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
