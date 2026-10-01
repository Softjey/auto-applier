import type { SiteAdapter, WidgetGroup } from './types';
import { clean } from '../core/text';

/**
 * Ashby (jobs.ashbyhq.com/<tenant>/<job>/application) — see ats/jobs.ashbyhq.com.md. React-
 * controlled inputs named by bare UUIDs, a Location autocomplete, and Yes/No questions drawn as
 * a two-button segmented control (no role, no radio) whose state is a hashed `_active_` class.
 */
const YESNO = 'button.ashby-application-form-input-yesno-option';
const ENTRY = '.ashby-application-form-field-entry';

const entryOf = (el: Element): Element | null => el.closest(ENTRY);

export const ashby: SiteAdapter = {
  id: 'ashby',
  matchPatterns: ['https://jobs.ashbyhq.com/*', 'https://jobs.eu.ashbyhq.com/*'],
  // The posting itself has no form; the application is its own `/application` route.
  matches: (url) =>
    /^jobs(\.[a-z]+)?\.ashbyhq\.com$/.test(url.hostname) && /\/application\/?$/.test(url.pathname),
  // Ashby renders no <form> element around its fields.
  scope: (doc) =>
    doc.querySelector('[class*="ashby-application-form-container"]') ?? doc.body ?? null,
  // `_systemfield_name` is ONE box for the whole name; a bare "Name" would resolve to the given name.
  label: (el) =>
    el.getAttribute('name') === '_systemfield_name' ? 'Full name (first and last name)' : undefined,
  // A Yes/No pair keeps a hidden checkbox beside its buttons; the buttons are the field.
  ignore: (el) => el instanceof HTMLInputElement && entryOf(el)?.querySelector(YESNO) != null,
  groups: (root): WidgetGroup[] => {
    const byRow = new Map<Element, HTMLElement[]>();
    for (const button of root.querySelectorAll<HTMLElement>(YESNO)) {
      const row = button.parentElement;
      if (row) byRow.set(row, [...(byRow.get(row) ?? []), button]);
    }
    return [...byRow].map(([row, members]) => {
      const title = entryOf(row)?.querySelector(
        '.ashby-application-form-question-title, label',
      )?.textContent;
      const question = clean(title);
      return { kind: 'radio-group', members, question, required: /[*✱]/.test(question) };
    });
  },
  // "I've read this and understand that generic AI-generated answers may hurt my application":
  // ticking it for answers an agent drafted misrepresents the application (ats/jobs.ashbyhq.com.md).
  // Also never opt into a talent pool.
  neverTick: /generic ai|ai[- ]generated|rather read your own words|talent (pool|community)/i,
};
