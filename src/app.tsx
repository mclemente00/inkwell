import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { loadHands } from './fonts';
import { here, nearest } from './geo';
import { paperOf } from './paper';
import { allNotes, blankNote, byOrder, deleteNote, isEmpty, loadSettings, nextOrder, persist, putNote, saveSettings } from './store';
import type { GeoPoint, Note, Settings } from './types';
import { Book } from './components/Book';
import { Cover } from './components/Cover';
import { Customize } from './components/Customize';
import { NotesList } from './components/NotesList';
import { SettingsSheet } from './components/SettingsSheet';

type Overlay = null | 'list' | 'customize' | 'settings';

/** Matches --cover in styles.css. */
const COVER_BG = '#1e2b27';

const latest = (notes: Note[]) => notes.reduce<Note | null>((a, n) => (!a || n.updated > a.updated ? n : a), null);

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [notes, setNotes] = useState<Note[]>([]);
  const [current, setCurrent] = useState<Note>(blankNote);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<'cover' | 'book'>('cover');
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [position, setPosition] = useState<GeoPoint | null>(null);
  const [fontsReady, setFontsReady] = useState(0);
  const [toastMsg, setToastMsg] = useState<{ text: string; action?: { label: string; run: () => void } } | null>(null);
  const [coverStatus, setCoverStatus] = useState('');
  const [persisted, setPersisted] = useState(false);

  const currentRef = useRef(current);
  currentRef.current = current;
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const saveTimer = useRef<number | undefined>();
  const positionP = useRef<Promise<GeoPoint | null> | null>(null);

  const toastTimer = useRef<number | undefined>();
  /** A short message; with an action (like Undo) it stays a little longer and can be tapped. */
  const toast = useCallback((text: string, action?: { label: string; run: () => void }) => {
    setToastMsg({ text, action });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), action ? 5000 : 2600);
  }, []);

  const locate = useCallback(() => {
    positionP.current ??= here().then((p) => {
      setPosition(p);
      if (!p) positionP.current = null;
      return p;
    });
    return positionP.current;
  }, []);

  useEffect(() => {
    allNotes()
      .then((ns) => setNotes(ns.filter((n) => !isEmpty(n)).sort(byOrder)))
      .catch(() => toast('This browser won’t let Inkwell store notes. Private browsing?'))
      .finally(() => setLoaded(true));
    loadHands().then(() => setFontsReady((x) => x + 1));
    persist().then(setPersisted);
    if (settings.useLocation) locate();
  }, []);

  // Before the cover opens, put the right page underneath it.
  useEffect(() => {
    if (!loaded || view !== 'cover') return;
    const mode = settings.openWith;
    if (mode === 'new') setCurrent(blankNote());
    else if (mode === 'nearby' && position) setCurrent(nearest(notes, position)?.note ?? latest(notes) ?? blankNote());
    else setCurrent(latest(notes) ?? blankNote());
  }, [loaded, view, position, settings.openWith]);

  // iOS samples the document background for the blur behind the status bar, and shows it in any gap
  // around the viewport, so paint it to match whatever is on screen: the cover, or the paper.
  useEffect(() => {
    const listBg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const bg =
      view === 'cover' ? COVER_BG : overlay === 'list' || overlay === 'settings' ? listBg || paperOf(settings).bg : paperOf(settings).bg;
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg);
  }, [view, overlay, settings.paper]);

  // ---------- saving ----------

  const save = useCallback(async (n: Note) => {
    const known = notesRef.current.some((x) => x.id === n.id);
    if (isEmpty(n)) {
      if (known) {
        setNotes((ns) => ns.filter((x) => x.id !== n.id));
        await deleteNote(n.id);
      }
      return;
    }
    await putNote(n);
    if (!known && !n.loc && settingsRef.current.useLocation) {
      const loc = await locate();
      if (loc) {
        const tagged = { ...(currentRef.current.id === n.id ? currentRef.current : n), loc };
        if (currentRef.current.id === n.id) setCurrent(tagged);
        setNotes((ns) => ns.map((x) => (x.id === n.id ? tagged : x)));
        await putNote(tagged);
      }
    }
  }, []);

  const flush = useCallback(() => {
    if (saveTimer.current === undefined) return;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    save(currentRef.current);
  }, []);

  const onChange = useCallback((n: Note) => {
    // A page joins the end of the notebook the first time it has something on it.
    if (n.order === undefined && !isEmpty(n) && !notesRef.current.some((x) => x.id === n.id)) {
      n = { ...n, order: nextOrder(notesRef.current) };
    }
    setCurrent(n);
    currentRef.current = n;
    setNotes((ns) => {
      const i = ns.findIndex((x) => x.id === n.id);
      if (isEmpty(n)) return i === -1 ? ns : ns.filter((x) => x.id !== n.id);
      if (i === -1) return [...ns, n].sort(byOrder);
      const copy = ns.slice();
      copy[i] = n;
      return copy;
    });
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      save(currentRef.current);
    }, 350);
  }, []);

  useEffect(() => {
    const onHide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, []);

  const navigate = useCallback((target: Note | 'new') => {
    flush();
    setCurrent(target === 'new' ? blankNote() : target);
  }, []);

  // ---------- opening ----------

  async function onOpen() {
    if (settings.openWith === 'nearby') {
      setCoverStatus('Finding notes near you…');
      const p = await locate();
      setCoverStatus('');
      const near = p ? nearest(notesRef.current, p) : null;
      if (near) setCurrent(near.note);
      else {
        setCurrent(latest(notesRef.current) ?? blankNote());
        if (notesRef.current.length) toast(p ? 'No notes near here. Opened your latest.' : 'Location unavailable. Opened your latest.');
      }
    }
  }

  function onOpened() {
    setView('book');
    if (settings.openWith === 'list' && notes.length) setOverlay('list');
  }

  function closeBook() {
    flush();
    setOverlay(null);
    setView('cover');
  }

  function changeSettings(s: Settings) {
    setSettings(s);
    saveSettings(s);
    if (s.useLocation && !settings.useLocation) locate();
  }

  /** Delete a page from the page itself or the list, with a few seconds to undo. */
  async function onDelete(n: Note) {
    const wasCurrent = currentRef.current.id === n.id;
    if (wasCurrent) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    const order = notesRef.current;
    const i = order.findIndex((x) => x.id === n.id);
    const rest = order.filter((x) => x.id !== n.id);
    setNotes(rest);
    notesRef.current = rest;
    await deleteNote(n.id);
    if (wasCurrent) setCurrent(rest[Math.max(0, i - 1)] ?? blankNote());
    toast('Page deleted.', {
      label: 'Undo',
      run: async () => {
        await putNote(n);
        const back = [...notesRef.current.filter((x) => x.id !== n.id), n].sort(byOrder);
        setNotes(back);
        notesRef.current = back;
        if (wasCurrent) setCurrent(n);
        setToastMsg(null);
      },
    });
  }

  /** Name a page from the list; an empty name goes back to its first line. Not counted as an edit. */
  async function onRename(n: Note, title: string) {
    const t = title.trim() || undefined;
    if (t === n.title) return;
    const next = { ...n, title: t };
    setNotes((ns) => ns.map((x) => (x.id === n.id ? next : x)));
    if (currentRef.current.id === n.id) {
      currentRef.current = { ...currentRef.current, title: t };
      setCurrent(currentRef.current);
    }
    await putNote(next);
  }

  /** Bookmarking from the list. It isn't an edit, so the page keeps its edited time. */
  async function onToggleBookmark(n: Note) {
    const next = { ...n, bookmarked: !n.bookmarked };
    setNotes((ns) => ns.map((x) => (x.id === n.id ? next : x)));
    if (currentRef.current.id === n.id) {
      currentRef.current = { ...currentRef.current, bookmarked: next.bookmarked };
      setCurrent(currentRef.current);
    }
    await putNote(next);
  }

  /** Save a new notebook order from the list. Order changes don't count as edits. */
  async function onReorder(ids: string[]) {
    const pos = new Map(ids.map((id, i) => [id, i]));
    const next = notesRef.current.map((n) => ({ ...n, order: pos.get(n.id) ?? n.order })).sort(byOrder);
    setNotes(next);
    notesRef.current = next;
    const cur = next.find((n) => n.id === currentRef.current.id);
    if (cur) {
      currentRef.current = { ...currentRef.current, order: cur.order };
      setCurrent(currentRef.current);
    }
    for (const n of next) await putNote(n);
  }

  async function onImport(incoming: Note[]): Promise<number> {
    const have = new Set(notesRef.current.map((n) => n.id));
    const fresh = incoming.filter((n) => n && typeof n.id === 'string' && Array.isArray(n.blocks) && Array.isArray(n.strokes) && !have.has(n.id));
    for (const n of fresh) await putNote(n);
    setNotes((ns) => [...ns, ...fresh].sort(byOrder));
    return fresh.length;
  }

  return (
    <div class="app">
      <Book
        note={current}
        notes={notes}
        settings={settings}
        fontsReady={fontsReady}
        onChange={onChange}
        onNavigate={navigate}
        onList={() => {
          flush();
          setOverlay('list');
        }}
        onCustomize={() => setOverlay('customize')}
        onDelete={onDelete}
        toast={toast}
      />

      {overlay === 'customize' && <Customize settings={settings} onChange={changeSettings} onClose={() => setOverlay(null)} />}

      {(overlay === 'list' || overlay === 'settings') && (
        <NotesList
          notes={notes}
          settings={settings}
          position={position}
          currentId={current.id}
          onOpen={(n) => {
            navigate(n);
            setOverlay(null);
          }}
          onNew={() => {
            navigate('new');
            setOverlay(null);
          }}
          onClose={() => setOverlay(null)}
          onCloseBook={closeBook}
          onSettings={() => setOverlay('settings')}
          onReorder={onReorder}
          onDelete={onDelete}
          onToggleBookmark={onToggleBookmark}
          onRename={onRename}
        />
      )}
      {overlay === 'settings' && (
        <SettingsSheet
          settings={settings}
          notes={notes}
          persisted={persisted}
          onChange={changeSettings}
          onImport={onImport}
          onClose={() => setOverlay('list')}
        />
      )}

      {view === 'cover' && <Cover settings={settings} status={coverStatus} onOpen={onOpen} onOpened={onOpened} />}

      <div class={`toast ${toastMsg ? 'show' : ''} ${toastMsg?.action ? 'has-action' : ''}`} role="status" aria-live="polite">
        <span>{toastMsg?.text}</span>
        {toastMsg?.action && (
          <button class="toast-action" onClick={toastMsg.action.run}>
            {toastMsg.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
