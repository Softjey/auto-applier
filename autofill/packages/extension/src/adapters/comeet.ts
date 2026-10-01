import type { SiteAdapter } from './types';

/**
 * Comeet's application form (www.comeet.co/jobs/<job>/<pos>/apply) — see ats/www.comeet.co.md.
 * Core fields are named by short keys (firstName, lastName, email, phone, cv, linkedin…); the
 * employer's own screening questions are named by their full text. The comeet.com wrapper page
 * holds the form in a cross-origin iframe, so the panel mounts only on the iframe's own URL.
 */
export const comeet: SiteAdapter = {
  id: 'comeet',
  matchPatterns: ['https://www.comeet.co/jobs/*', 'https://www.comeet.com/jobs/*'],
  matches: (url) =>
    /^www\.comeet\.(co|com)$/.test(url.hostname) && /\/apply\/?$/.test(url.pathname),
  scope: (doc) => doc.querySelector('form:has(input[name="email"])') ?? doc.querySelector('form'),
  // "Personal note" stays empty unless the posting asks for something specific there.
  neverTick: /talent (pool|community)|future (opportunit|role|position)/i,
};
