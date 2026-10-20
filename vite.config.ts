import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

/** Emit a service worker that precaches every built file, so the app works offline from first install. */
function serviceWorker(): Plugin {
  return {
    name: 'inkwell-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['./', ...Object.keys(bundle).filter((f) => !f.endsWith('.woff')).map((f) => `./${f}`), ...readdirSync('public').map((f) => `./${f}`)];
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10);
      const source = `const CACHE = 'inkwell-${version}';
const PRECACHE = ${JSON.stringify(files)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // Fresh HTML when online, so updates arrive; cached shell when not.
    // no-cache revalidates past GitHub Pages' 10-minute browser cache.
    e.respondWith(fetch(req, { cache: 'no-cache' }).catch(() => caches.match('./', { ignoreSearch: true })));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

/** Short commit hash, shown in Settings so it's clear which version a phone is running. */
function buildId(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

// Relative base so the build works at a domain root or under /inkwell/ (GitHub Pages).
export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(buildId()) },
  plugins: [preact(), serviceWorker()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
});
