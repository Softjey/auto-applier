import type { SiteAdapter } from './types';

/**
 * SmartRecruiters "oneclick" apply (jobs.smartrecruiters.com/oneclick-ui/company/<org>/
 * publication/<id>) — see ats/jobs.smartrecruiters.com.md. The whole form lives in open shadow
 * DOM (the scan walks into it), and uploading a CV runs a parser that overwrites the personal
 * fields already typed — so the CV goes first.
 */
export const smartrecruiters: SiteAdapter = {
  id: 'smartrecruiters',
  matchPatterns: ['https://jobs.smartrecruiters.com/*'],
  matches: (url) =>
    url.hostname === 'jobs.smartrecruiters.com' &&
    url.pathname.startsWith('/oneclick-ui/') &&
    !/\/success\/?$/.test(url.pathname),
  cvFirst: true,
  refillAfterCvMs: 4000,
  // Optional free message to the hiring manager: leave empty.
  ignore: (el) => el.id === 'hiring-manager-message-input',
  neverTick: /talent (pool|community)|future (opportunit|role|position|recruit)/i,
};
