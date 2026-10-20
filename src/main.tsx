import { render } from 'preact';
import { App } from './app';
import './styles.css';

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
