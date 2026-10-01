import { clean } from '../core/text';
import type { SiteAdapter } from './types';

/**
 * Lever (jobs.lever.co/<company>/<id>/apply) — plain named inputs (`name`, `email`, `phone`,
 * `org`, `urls[LinkedIn]`, `cards[<id>][field0]`), a hidden `resume` file input and an hCaptcha
 * the person solves before pressing Submit. Each question sits in a <label> that ALSO wraps its
 * field, so the generic label would glue a select's option texts onto the question.
 */
export const lever: SiteAdapter = {
  id: 'lever',
  matchPatterns: ['https://jobs.lever.co/*', 'https://jobs.eu.lever.co/*'],
  matches: (url) =>
    /^jobs(\.eu)?\.lever\.co$/.test(url.hostname) && /\/apply\/?$/.test(url.pathname),
  scope: (doc) =>
    doc.querySelector('#application-form') ?? doc.querySelector('form:has(input[name="email"])'),
  // Take only the question's own text, and keep the required mark in a form the planner reads.
  label: (el) => {
    const title = el.closest('.application-question')?.querySelector('.application-label');
    if (!title) return undefined;
    const text = clean(title.textContent).replace(/\s*✱\s*$/, '');
    return title.querySelector('.required') ? `${text} *` : text;
  },
  neverTick: /talent (pool|community)|future (opportunit|role|position)/i,
};
