import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { markUpdateReady, watchForUpdates } from './ui/update';

const root = document.getElementById('app');
if (root) render(<App />, root);

// Offline after the first load (SPEC.md section 7). Production builds only:
// the dev server has no service worker.
if (import.meta.env.PROD) {
  const update = registerSW({
    onNeedRefresh: () => markUpdateReady(update),
    onRegisteredSW: (_url, reg) => reg && watchForUpdates(reg),
  });
}
