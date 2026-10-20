// Touch gesture tests (swipe, hold-and-drag, pull to dismiss) using Chromium's touch emulation.
// Run: npm run build && node tests/gestures.mjs
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';

const PORT = 4178;
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
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
/** Finger down at (x,y), optionally hold, move by (dx,dy) in steps, lift. */
async function gesture(x, y, dx, dy, { hold = 0, steps = 12 } = {}) {
  await touch('touchStart', x, y);
  if (hold) await page.waitForTimeout(hold);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', x + (dx * i) / steps, y + (dy * i) / steps); await page.waitForTimeout(16); }
  await touch('touchEnd');
  await page.waitForTimeout(350);
}
const fails = [];
const ok = (c, m) => (c ? console.log('  ✓', m) : (fails.push(m), console.log('  ✗', m)));
await page.goto(`http://localhost:${PORT}/`);
await page.waitForTimeout(600);
await page.click('.cover'); await page.waitForTimeout(1000);
for (const [i, t] of ['One', 'Two', 'Three'].entries()) {
  if (i) { await page.click('[aria-label="Turn to a new page"]'); await page.waitForTimeout(900); }
  const box = await page.locator('.page').boundingBox();
  await page.mouse.click(box.x + 40, box.y + 60);
  await page.keyboard.type(t);
  await page.click('[aria-label="Done"]'); await page.waitForTimeout(500);
}
await page.click('[aria-label="All notes"]'); await page.waitForTimeout(400);
const titles = () => page.locator('.row-title').allTextContents();
const rowBox = async (i) => page.locator('.row').nth(i).boundingBox();

// Swipe right on "Two" bookmarks it.
let b = await rowBox(1);
await gesture(b.x + 60, b.y + b.height / 2, 200, 0);
ok(await page.locator('.row').nth(1).locator('.row-mark').count() === 1, 'swipe right bookmarks a page');

// Swipe left on "Two" deletes it, Undo brings it back.
b = await rowBox(1);
await gesture(b.x + b.width - 20, b.y + b.height / 2, -(b.width - 40), 0);
ok(JSON.stringify(await titles()) === '["One","Three"]', 'a long swipe left deletes a page');
ok(await page.locator('.toast-action').isVisible(), 'Undo is offered');
await page.click('.toast-action'); await page.waitForTimeout(400);
ok(JSON.stringify(await titles()) === '["One","Two","Three"]', 'Undo restores it in place');

// A short swipe left opens Rename / Delete; Rename edits the title in place.
b = await rowBox(0);
await gesture(b.x + 250, b.y + b.height / 2, -110, 0);
ok(await page.locator('.swipe-btn.rename').isVisible(), 'a short swipe left shows Rename and Delete');
await page.locator('.swipe-btn.rename').tap(); await page.waitForTimeout(200);
ok(await page.evaluate(() => document.activeElement?.classList.contains('row-title-input')), 'Rename puts the cursor in the title');
await page.keyboard.press('Control+A');
await page.keyboard.type('Morning pages');
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
ok((await titles())[0] === 'Morning pages', 'the new title shows in the list');
// Tapping a row while another is open just closes it.
b = await rowBox(0);
await gesture(b.x + 250, b.y + b.height / 2, -110, 0);
await page.locator('.row-main').nth(1).tap(); await page.waitForTimeout(300);
ok(await page.locator('.list-view').count() === 1 && !(await page.locator('.swipe-btn.rename').isVisible()), 'tapping elsewhere closes an open row');
// Clearing the title goes back to the first line.
b = await rowBox(0);
await gesture(b.x + 250, b.y + b.height / 2, -110, 0);
await page.locator('.swipe-btn.rename').tap(); await page.waitForTimeout(200);
await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
await page.keyboard.press('Enter'); await page.waitForTimeout(300);
ok((await titles())[0] === 'One', 'clearing a title shows the first line again');

// Hold "Three" and drag it to the top.
b = await rowBox(2);
await gesture(b.x + 100, b.y + b.height / 2, 0, -260, { hold: 550, steps: 16 });
ok(JSON.stringify(await titles()) === '["Three","One","Two"]', 'hold and drag reorders pages');

// A plain vertical scroll-type move does not reorder or swipe.
b = await rowBox(0);
await gesture(b.x + 100, b.y + b.height / 2, 0, 120, { steps: 6 });
ok(JSON.stringify(await titles()) === '["Three","One","Two"]', 'a quick vertical drag is just a scroll');

// A tap still opens the page.
await page.locator('.row-main', { hasText: 'One' }).tap(); await page.waitForTimeout(400);
ok(await page.locator('.list-view').count() === 0 && (await page.locator('.tb').allTextContents())[0] === 'One', 'tap opens the page');

// Pull down on the list header closes the list.
await page.click('[aria-label="All notes"]'); await page.waitForTimeout(400);
const h = await page.locator('.list-head h1').boundingBox();
await gesture(h.x + h.width / 2, h.y + h.height / 2, 0, 180);
ok(await page.locator('.list-view').count() === 0, 'pull down closes the notes list');

// Pull down on the Customise sheet header closes it.
await page.click('[aria-label="Paper, ink and handwriting"]'); await page.waitForTimeout(400);
const sh = await page.locator('.sheet-head h2').boundingBox();
await gesture(sh.x + sh.width / 2, sh.y + sh.height / 2, 0, 200);
ok(await page.locator('.sheet').count() === 0, 'pull down closes the Customise sheet');

// A short pull springs back.
await page.click('[aria-label="Paper, ink and handwriting"]'); await page.waitForTimeout(400);
const sh2 = await page.locator('.sheet-head h2').boundingBox();
await gesture(sh2.x + sh2.width / 2, sh2.y + sh2.height / 2, 0, 30, { steps: 10 });
ok(await page.locator('.sheet').count() === 1, 'a short pull springs back');
await page.waitForTimeout(400);
await browser.close();
stopServer();
console.log(fails.length ? `\n${fails.length} gesture check(s) failed` : '\nall gesture checks passed');
process.exit(fails.length ? 1 : 0);
