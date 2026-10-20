// Render public/icon.svg to the PNG sizes iOS and Android want. Run: node scripts/icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
// iOS rounds corners itself, so the touch icon is full-bleed.
const square = svg.replace(/rx="112"/, 'rx="0"');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, src] of [
  ['icon-192.png', 192, svg],
  ['icon-512.png', 512, svg],
  ['apple-touch-icon.png', 180, square],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${src}`);
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: true });
}
await browser.close();
console.log('icons written');
