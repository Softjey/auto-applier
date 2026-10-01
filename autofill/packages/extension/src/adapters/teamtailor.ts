import type { SiteAdapter } from './types';

/**
 * Teamtailor — see ats/teamtailor.com.md. Multi-tenant: `<tenant>.teamtailor.com`, but most
 * companies serve the same pages on their own domain (`dnatechnology.work/jobs/<id>-<slug>`),
 * so a page that is a /jobs/<id>-<slug> posting AND carries Teamtailor's assets is taken too.
 * "Apply" expands the form in place after a ~10 s mount; until then there is nothing to fill
 * and the panel reports an empty form — press Fill again once the fields show.
 */
const JOB_PATH = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?jobs\/\d+/;

export const teamtailor: SiteAdapter = {
  id: 'teamtailor',
  matchPatterns: ['https://*.teamtailor.com/*', 'https://*/jobs/*'],
  matches: (url) => /\.teamtailor\.com$/.test(url.hostname) && JOB_PATH.test(url.pathname),
  detect: (url, doc) =>
    JOB_PATH.test(url.pathname) &&
    doc.querySelector(
      'script[src*="teamtailor"], link[href*="teamtailor"], img[src*="teamtailor"]',
    ) !== null,
  scope: (doc) => doc.querySelector('form:has(input[name="candidate[email]"])'),
  // Submitting is itself the consent here; a "Connect"/talent-pool offer is never ticked.
  neverTick: /talent (pool|community)|future (opportunit|role|position)|stay in touch/i,
};
