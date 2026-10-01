import type { SiteAdapter } from './types';

/**
 * Greenhouse-hosted boards (job-boards.greenhouse.io, the EU twin, and the legacy boards.…) —
 * see ats/job-boards.greenhouse.io.md. Fields are keyed by `id` (`first_name`, `question_<n>`),
 * every dropdown is react-select, the résumé input is hidden behind an Attach button.
 *
 * A company careers page that EMBEDS the form does so in a cross-origin iframe; the panel is
 * not mounted there. Open the iframe's own URL in the tab first (the apply-to-jobs skill says how).
 */
export const greenhouse: SiteAdapter = {
  id: 'greenhouse',
  matchPatterns: [
    'https://job-boards.greenhouse.io/*',
    'https://job-boards.eu.greenhouse.io/*',
    'https://boards.greenhouse.io/*',
    'https://boards.eu.greenhouse.io/*',
  ],
  matches: (url) =>
    /^(job-)?boards(\.eu)?\.greenhouse\.io$/.test(url.hostname) &&
    !/confirmation/.test(url.pathname) &&
    (/\/jobs\/\d+/.test(url.pathname) || url.pathname.startsWith('/embed/job_app')),
  scope: (doc) => doc.querySelector('form:has(#first_name)') ?? doc.querySelector('form'),
  // Optional, and never a reason to join a list.
  neverTick: /talent (pool|community|network)|future (opportunit|role|position)/i,
};
