/**
 * iOS home-screen / Safari often opens a tall page slightly scrolled down
 * (scroll restoration, safe-area chrome, transform entrance animations).
 * Pin the window to the top on cold start and when the app becomes visible
 * only if the offset is a small "phantom" nudge — not after the user scrolled.
 */

const PHANTOM_MAX_PX = 80;

export function currentScrollY() {
  if (typeof window === 'undefined') return 0;
  const doc = typeof document !== 'undefined' ? document : null;
  return (
    window.scrollY ||
    window.pageYOffset ||
    doc?.documentElement?.scrollTop ||
    doc?.body?.scrollTop ||
    0
  );
}

export function pinWindowTop({ force = false } = {}) {
  if (typeof window === 'undefined') return;
  const y = currentScrollY();
  if (!force && y > PHANTOM_MAX_PX) return;
  window.scrollTo(0, 0);
  if (typeof document !== 'undefined') {
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }
}

/** Keep the user's place after a full `#app` innerHTML re-render. */
export function restoreScrollY(y) {
  if (typeof window === 'undefined') return;
  const top = Math.max(0, Number(y) || 0);
  window.scrollTo(0, top);
  if (typeof document !== 'undefined') {
    document.documentElement.scrollTop = top;
    document.body.scrollTop = top;
  }
}

export function installScrollTopGuards() {
  if (typeof window === 'undefined') return () => {};

  try {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  } catch {
    /* ignore */
  }

  const onShow = () => {
    // Defer one frame so iOS finishes chrome layout, then kill phantom offset.
    requestAnimationFrame(() => pinWindowTop());
  };

  window.addEventListener('pageshow', onShow);
  window.addEventListener('load', onShow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onShow();
  });

  // First paint after module load.
  onShow();
  setTimeout(() => pinWindowTop(), 50);
  setTimeout(() => pinWindowTop(), 300);

  return () => {
    window.removeEventListener('pageshow', onShow);
    window.removeEventListener('load', onShow);
  };
}
