import './style.css';
import { createApp } from './app.js';
import { watchAppUpdates } from './lib/appUpdate.js';
import { installScrollTopGuards, pinWindowTop } from './lib/scrollLock.js';

// Kill iOS phantom scroll-before-paint / scroll restoration.
installScrollTopGuards();

createApp(document.querySelector('#app'));
pinWindowTop({ force: true });

// Home-screen (Safari) PWAs: detect new Pages builds without a manual clear URL.
watchAppUpdates();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl, { updateViaCache: 'none' })
      .then((reg) => {
        reg.update().catch(() => {});
        // Pull updates when returning to the installed web app.
        const poke = () => reg.update().catch(() => {});
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') poke();
        });
        window.addEventListener('focus', poke);
      })
      .catch(() => {});

    let refreshing = false;
    const reloadOnce = () => {
      if (refreshing) return;
      refreshing = true;
      location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'familyflow-sw-updated') reloadOnce();
    });
  });
}
