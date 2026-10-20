import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { loadHands } from './fonts';
import { here, nearest } from './geo';
import { allNotes, blankNote, byCreated, deleteNote, isEmpty, loadSettings, persist, putNote, saveSettings } from './store';
import type { GeoPoint, Note, Settings } from './types';
import { Book } from './components/Book';
import { Cover } from './components/Cover';
import { Customize } from './components/Customize';
import { NotesList } from './components/NotesList';
import { SettingsSheet } from './components/SettingsSheet';

type Overlay = null | 'list' | 'customize' | 'settings';

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
  const [toastMsg, setToastMsg] = useState('');
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
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 2600);
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
      .then((ns) => setNotes(ns.filter((n) => !isEmpty(n)).sort(byCreated)))
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
    setCurrent(n);
    currentRef.current = n;
    setNotes((ns) => {
      const i = ns.findIndex((x) => x.id === n.id);
      if (isEmpty(n)) return i === -1 ? ns : ns.filter((x) => x.id !== n.id);
      if (i === -1) return [...ns, n].sort(byCreated);
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

  async function onDelete(n: Note) {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    const order = notesRef.current;
    const i = order.findIndex((x) => x.id === n.id);
    const rest = order.filter((x) => x.id !== n.id);
    setNotes(rest);
    await deleteNote(n.id);
    setCurrent(rest[Math.max(0, i - 1)] ?? blankNote());
    toast('Page deleted.');
  }

  async function onImport(incoming: Note[]): Promise<number> {
    const have = new Set(notesRef.current.map((n) => n.id));
    const fresh = incoming.filter((n) => n && typeof n.id === 'string' && Array.isArray(n.blocks) && Array.isArray(n.strokes) && !have.has(n.id));
    for (const n of fresh) await putNote(n);
    setNotes((ns) => [...ns, ...fresh].sort(byCreated));
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

      <div class={`toast ${toastMsg ? 'show' : ''}`} role="status" aria-live="polite">
        {toastMsg}
      </div>
    </div>
  );
}
