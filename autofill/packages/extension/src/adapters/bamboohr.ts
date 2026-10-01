import type { SiteAdapter } from './types';

/**
 * BambooHR careers (<tenant>.bamboohr.com/careers/<id>) — see ats/bamboohr.com.md. The address
 * block is fully required, Country defaults to the US, Date Available follows the tenant's
 * locale, and a reCAPTCHA gates Submit (the person ticks it; this never does).
 */
export const bamboohr: SiteAdapter = {
  id: 'bamboohr',
  matchPatterns: ['https://*.bamboohr.com/*'],
  matches: (url) => /\.bamboohr\.com$/.test(url.hostname) && /^\/careers\/\d+/.test(url.pathname),
  scope: (doc) =>
    doc.querySelector('form:has(input[name="firstName"])') ??
    doc.querySelector('form:has(input[name^="customQuestionAnswers"])'),
  // `nickname_hpcsaf` ("Please leave this field blank"): the suffix changes per render.
  ignore: (el) => (el.getAttribute('name') ?? '').startsWith('nickname_'),
  neverTick: /talent (pool|community)|future (opportunit|role|position|recruit)/i,
};
