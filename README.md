# Inkwell

A notebook that writes in handwriting. Type anywhere on the page and your words appear in one of twelve handwriting faces, on the paper and ink you choose. Draw over the page with a pen, pencil or marker. Everything stays on your device.

**Live:** https://mclemente00.github.io/inkwell/

## Install on iPhone

1. Open the link above in Safari.
2. Tap Share → **Add to Home Screen**.
3. Launch it from the home screen. It runs full-screen and works offline.

Notes are stored in the browser's IndexedDB for that home-screen app. Use **Notes → Settings → Save backup** now and then; deleting the app from the home screen deletes its notes.

## Features

- **Opens to what matters**: a new page, your most recent note, the note nearest to where you are, or the full list.
- **12 handwriting faces** (open-licence Google Fonts), each auto-scaled to the same x-height and seated on the ruled line, with a slight per-letter wobble so it doesn't look typeset.
- **Paper**: cream, white, blush, sage, midnight. **Ink**: marine, plum, rust, teal, graphite. **Pages**: lined, grid, dotted, blank. **Size**: small, medium, large, extra large.
- **Type anywhere**: tap a spot to start writing there; drag the dotted grip to move a block.
- **Draw**: pen, pencil, marker, stroke eraser, colours that adapt to dark paper, undo/redo. Apple Pencil pressure is used when present; two fingers scroll while drawing.
- **Page turns**: swipe sideways or use ‹ › to flip between notes; turning past the last page starts a new one.
- **Notes list**: pages in notebook order. Hold a page and drag to reorder; tap **Edit** to rename pages or drag them by their handles. Swipe a page left to delete (with Undo), right to bookmark. Pull down on the header to close it, and on any sheet's title bar to close that.
- **Bookmarks**, **share as image** (PNG), **backup/restore** (JSON).

Not yet: your own handwriting as a font (planned for v1.1), cloud sync, home-screen widgets (not possible for web apps).

## Develop

```sh
npm install
npm run dev        # local dev server
npm run build      # type-check and build to dist/
npm test           # end-to-end and touch-gesture tests against the build (needs Playwright + Chromium)
node scripts/icons.mjs   # regenerate PNG icons from public/icon.svg
```

Stack: Vite, Preact, TypeScript, [perfect-freehand](https://github.com/steveruizok/perfect-freehand) for stroke outlines. No backend.

### How the page works

The page is laid out in fixed units (360 wide) and scaled to the screen, so notes look the same on any device. Text blocks store `x` and `y` in those units; `y` snaps to the current line height. Drawings are vector strokes (`[x, y, pressure, …]`), with colours stored as tokens (`ink`, `p0`–`p4`) so they follow the paper. The same layout code renders the DOM view and the PNG export.

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.
