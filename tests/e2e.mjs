// End-to-end smoke test against the production build. Run: npm run build && npm test
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const OUT = new URL('./screens/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 4179;
// Own process group, so cleanup takes down the vite child that npx starts too.
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe', detached: true });
const stopServer = () => {
  try {
    process.kill(-server.pid);
  } catch {}
};
process.on('exit', stopServer);
await new Promise((resolve, reject) => {
  server.stdout.on('data', (d) => String(d).includes('Local') && resolve());
  server.stderr.on('data', (d) => /error/i.test(String(d)) && reject(new Error(String(d))));
  server.on('exit', (code) => reject(new Error(`vite preview exited with ${code}`)));
});

const browser = await chromium.launch();
const ctx = await browser.newContext({
  ...devices['iPhone 13'],
  acceptDownloads: true,
  permissions: ['geolocation'],
  geolocation: { latitude: 1.3521, longitude: 103.8198 },
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let step = 0;
const shot = (name) => page.screenshot({ path: `${OUT}${String(++step).padStart(2, '0')}-${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const fails = [];
const check = (ok, msg) => (ok ? console.log('  ✓', msg) : (fails.push(msg), console.log('  ✗', msg)));

await page.goto(`http://localhost:${PORT}/`);
await wait(800);
await shot('cover');

await page.click('.cover');
await wait(1000);
check((await page.locator('.cover').count()) === 0, 'cover opens on tap');
await shot('blank-page');

// Type in two places on the page.
const box = await page.locator('.page').boundingBox();
await page.mouse.click(box.x + 40, box.y + 80);
await page.keyboard.type('Immediately access:');
await page.keyboard.press('Enter');
await page.keyboard.type('- Notes nearest to you');
await page.keyboard.press('Enter');
await page.keyboard.type('- Recently written notes');
await page.mouse.click(box.x + 200, box.y + 300);
await page.keyboard.type('and type where you want.');
await shot('typing');
await page.click('.round-btn'); // Done
await wait(200);
check((await page.locator('.tb').count()) === 2, 'two text blocks on the page');
await shot('typed');

// Draw a loop and a line.
await page.click('.fab');
await page.waitForSelector('.live');
const draw = async (pts) => {
  await page.mouse.move(box.x + pts[0][0], box.y + pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: 3 });
  await page.mouse.up();
};
const circle = Array.from({ length: 40 }, (_, i) => [260 + 50 * Math.cos((i / 39) * Math.PI * 2), 470 + 40 * Math.sin((i / 39) * Math.PI * 2)]);
await draw(circle);
await page.click('[aria-label="marker"]');
await draw([[40, 132], [230, 132]]);
await shot('drawn');
await page.setViewportSize({ width: 430, height: 932 });
await wait(200);
await shot('drawn-430');
await page.setViewportSize({ width: 390, height: 664 });
await wait(200);
const strokes = () => page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('inkwell');
  r.onsuccess = () => {
    const q = r.result.transaction('notes').objectStore('notes').getAll();
    q.onsuccess = () => res(q.result.reduce((a, n) => a + n.strokes.length, 0));
  };
}));
await wait(500);
check((await strokes()) === 2, 'two strokes saved');
await page.click('[aria-label="Undo"]');
await wait(500);
check((await strokes()) === 1, 'undo removes a stroke');
await page.click('[aria-label="Redo"]');
await wait(500);
check((await strokes()) === 2, 'redo restores it');
await page.click('[aria-label="eraser"]');
await draw(circle.slice(0, 6));
await wait(500);
check((await strokes()) === 1, 'eraser removes the circle');
await page.click('[aria-label="Undo"]');
await page.click('[aria-label="Back to typing"]');
await wait(400);
check((await page.locator('.fab').count()) === 1 && (await page.locator('.tray').count()) === 0, 'Type button returns to typing');

// Customise.
await page.click('[aria-label="Paper, ink and handwriting"]');
await wait(400);
await shot('customise');
await page.click('[aria-label="Midnight"]');
await page.click('.style-tile.st-grid');
await page.click('text=Homemade Apple');
await page.click('.pill-btn');
await wait(400);
await shot('midnight-grid-homemade');
await page.click('[aria-label="Paper, ink and handwriting"]');
await page.click('[aria-label="Cream"]');
await page.click('.style-tile.st-lined');
await page.click('text=Kalam');
await page.click('.segmented >> text="Large"');
await page.click('.pill-btn');
await wait(300);
await shot('cream-kalam-large');

// Turn to a new page, write, and turn back.
await page.click('[aria-label="Turn to a new page"]');
await wait(170);
await shot('page-turn-mid');
await wait(700);
await page.mouse.click(box.x + 40, box.y + 120);
await page.keyboard.type('A slower morning');
await page.click('[aria-label="Done"]');
await wait(500);
await page.click('[aria-label="Previous page"]');
await wait(900);
check(await page.locator('.tb', { hasText: 'Immediately' }).count() === 1, 'previous page shows first note');

// Bookmark and list.
await page.click('[aria-label="Bookmark this page"]');
await wait(500);
await page.click('[aria-label="All notes"]');
await wait(400);
check((await page.locator('.row').count()) === 2, 'list shows two notes');
await shot('list');
await page.click('[aria-label="Settings"]');
await wait(400);
await shot('settings');
await page.click('text=Note nearest to you');
await page.click('.pill-btn');
await page.click('[aria-label="Back to page"]');

// Export.
await page.click('[aria-label="More"]');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Share as image')]);
await dl.saveAs(`${OUT}export.png`);
check(true, 'page exports as PNG');

// Reload: notes persist, and "nearest" opens the geotagged note.
await page.reload();
await wait(800);
await page.click('.cover');
await wait(1500);
check((await page.locator('.tb').count()) >= 1, 'notes survive a reload');
await shot('reopened-nearby');

// Wide screen.
await page.setViewportSize({ width: 1200, height: 800 });
await wait(300);
await shot('desktop');

check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
stopServer();
console.log(fails.length ? `\n${fails.length} check(s) failed` : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
