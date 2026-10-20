import { render } from 'preact';
import { App } from './app';
import './styles.css';

/**
 * Home-screen apps on iOS report a viewport one status bar shorter than the screen while drawing
 * from the very top, leaving a strip at the bottom. A standalone app always owns the whole screen,
 * so size it from the screen itself (iOS keeps screen.* in portrait terms, hence the swap).
 */
function sizeApp() {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
  const portrait = innerWidth < innerHeight;
  const h = standalone ? Math.max(innerHeight, portrait ? screen.height : screen.width) : innerHeight;
  document.documentElement.style.setProperty('--app-h', `${h}px`);
}
sizeApp();
addEventListener('resize', sizeApp);
addEventListener('orientationchange', () => setTimeout(sizeApp, 300));

render(<App />, document.getElementById('app')!);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    let reg: ServiceWorkerRegistration;
    try {
      reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    } catch {
      return; // offline support is a bonus; the app works without it
    }

    // iOS resumes home-screen apps instead of relaunching them, so check for updates on every return.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });

    // A new version took over: reload now if nobody is typing, otherwise the next time the app is hidden.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return; // first install, nothing old to replace
      const typing = document.activeElement?.tagName === 'TEXTAREA';
      if (!typing) return location.reload();
      document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && location.reload(), { once: true });
    });
  });
}
