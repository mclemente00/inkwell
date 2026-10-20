import type { Note, Settings } from './types';

const DB = 'inkwell';
const STORE = 'notes';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
  });
}

export const allNotes = () => tx<Note[]>('readonly', (s) => s.getAll());
export const putNote = (n: Note) => tx('readwrite', (s) => s.put(n));
export const deleteNote = (id: string) => tx('readwrite', (s) => s.delete(id));

/** Ask the browser not to evict our data under storage pressure. */
export async function persist(): Promise<boolean> {
  try {
    if (await navigator.storage?.persisted?.()) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

const SETTINGS_KEY = 'inkwell.settings';

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  paper: 'cream',
  ink: 'marine',
  pageStyle: 'lined',
  font: 'caveat',
  size: 'M',
  openWith: 'recent',
  useLocation: false,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable; settings live for this session only */
  }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const isEmpty = (n: Note) => n.strokes.length === 0 && n.blocks.every((b) => !b.text.trim());

export const blankNote = (): Note => {
  const now = Date.now();
  return { id: uid(), created: now, updated: now, bookmarked: false, blocks: [], strokes: [] };
};

/** First line of text, for lists. */
export function titleOf(n: Note): string {
  const b = [...n.blocks].sort((a, c) => a.y - c.y || a.x - c.x).find((b) => b.text.trim());
  return b ? b.text.trim().split('\n')[0] : n.strokes.length ? 'Sketch' : 'Empty page';
}

/** A page's place in the notebook: where it was moved to, or when it was written if never moved. */
export const orderOf = (n: Note) => n.order ?? n.created;
export const byOrder = (a: Note, b: Note) => orderOf(a) - orderOf(b);
/** Position for a page added at the end of the notebook. */
export const nextOrder = (notes: Note[]) => notes.reduce((m, n) => Math.max(m, orderOf(n)), 0) + 1;
