import { useState } from 'preact/hooks';
import type { Note, OpenWith, Settings } from '../types';
import { Sheet } from './Sheet';

interface Props {
  settings: Settings;
  notes: Note[];
  persisted: boolean;
  onChange: (s: Settings) => void;
  onImport: (notes: Note[]) => Promise<number>;
  onClose: () => void;
}

const OPEN: { id: OpenWith; label: string; hint: string }[] = [
  { id: 'new', label: 'A new page', hint: 'Ready to write the moment it opens' },
  { id: 'recent', label: 'Most recent note', hint: 'Pick up where you left off' },
  { id: 'nearby', label: 'Note nearest to you', hint: 'Uses your location, falls back to most recent' },
  { id: 'list', label: 'All notes', hint: 'Start from the list' },
];

export function SettingsSheet({ settings: s, notes, persisted, onChange, onImport, onClose }: Props) {
  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch });
  const [msg, setMsg] = useState('');

  function exportBackup() {
    const data = JSON.stringify({ app: 'inkwell', version: 1, exported: new Date().toISOString(), settings: s, notes });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = `inkwell-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setMsg(`Saved a backup of ${notes.length} note${notes.length === 1 ? '' : 's'}.`);
  }

  async function importBackup(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data?.app !== 'inkwell' || !Array.isArray(data.notes)) throw new Error('not an Inkwell backup');
      const n = await onImport(data.notes);
      setMsg(`Restored ${n} note${n === 1 ? '' : 's'}. Notes already here were kept.`);
    } catch (err) {
      setMsg(`That file couldn't be read: ${(err as Error).message}.`);
    }
  }

  return (
    <Sheet title="Settings" onClose={onClose} tall>
      <section class="cz-section">
        <h3>Name on the cover</h3>
        <input
          id="cover-name"
          class="text-input"
          type="text"
          value={s.name}
          maxLength={40}
          placeholder="Your name"
          onInput={(e) => set({ name: (e.currentTarget as HTMLInputElement).value })}
        />
      </section>

      <section class="cz-section">
        <h3>Open the notebook to</h3>
        <div class="options" role="radiogroup">
          {OPEN.map((o) => (
            <button key={o.id} role="radio" aria-checked={s.openWith === o.id} class={`option ${s.openWith === o.id ? 'on' : ''}`} onClick={() => set({ openWith: o.id, useLocation: o.id === 'nearby' ? true : s.useLocation })}>
              <span>
                <b>{o.label}</b>
                <small>{o.hint}</small>
              </span>
              <span class="radio" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section class="cz-section">
        <label class="toggle-row" for="use-loc">
          <span>
            <b>Remember where notes were written</b>
            <small>Saved on this device only. Needed for “Note nearest to you”.</small>
          </span>
          <input id="use-loc" type="checkbox" class="toggle" checked={s.useLocation} onChange={(e) => set({ useLocation: (e.currentTarget as HTMLInputElement).checked })} />
        </label>
      </section>

      <section class="cz-section">
        <h3>Backup</h3>
        <p class="fine">
          Notes live only in this browser on this device{persisted ? ', and it has agreed to keep them' : ''}. Save a backup now and then.
        </p>
        <div class="btn-row">
          <button class="ghost-btn" onClick={exportBackup}>
            Save backup
          </button>
          <label class="ghost-btn" for="import-file">
            Restore backup
          </label>
          <input id="import-file" type="file" accept="application/json,.json" class="sr" onChange={importBackup} />
        </div>
        {msg && (
          <p class="fine" role="status">
            {msg}
          </p>
        )}
      </section>

      <p class="fine about">
        Inkwell 0.1 · build {__BUILD__} · handwriting faces from Google Fonts under the SIL Open Font Licence.
      </p>
    </Sheet>
  );
}
