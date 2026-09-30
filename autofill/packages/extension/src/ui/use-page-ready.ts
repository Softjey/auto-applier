import { useEffect, useState } from 'react';

const SETTLE_MS = 400;
/** A page that never fires `load` (a hung widget) must not lock the button forever. */
const GIVE_UP_MS = 20_000;

/**
 * True once the host page has finished loading. Until then the panel's button is disabled:
 * a Next.js page hydrating the whole document intercepts clicks aimed at anything under
 * <html> — ours included — so a click before `load` reaches our button but never our React
 * handler (found on live eRecruiter). Waiting is what the site's own form needs as well.
 */
export function usePageReady(): boolean {
  const [ready, setReady] = useState(() => document.readyState === 'complete');

  useEffect(() => {
    if (ready) return;
    const done = () => window.setTimeout(() => setReady(true), SETTLE_MS);
    window.addEventListener('load', done, { once: true });
    const giveUp = window.setTimeout(() => setReady(true), GIVE_UP_MS);
    return () => {
      window.removeEventListener('load', done);
      window.clearTimeout(giveUp);
    };
  }, [ready]);

  return ready;
}
