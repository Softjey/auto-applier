import type { SiteAdapter } from '../adapters';
import { setChecked, setText } from '../core/setters';
import { clean } from '../core/text';
import { isVisible } from '../core/visibility';
import { labelFor } from '../core/labels';
import type { AccountForm } from './detect';

export interface Credential {
  login: string;
  password: string;
}

export interface FillResult {
  username: boolean;
  passwords: boolean;
}

/**
 * Write a login into a sign-in block. Typing it the way setText does (native setter + real
 * events) is what makes React/Angular-controlled inputs notice; the readback inside setText
 * tells us whether the page kept it.
 */
export function fillLogin(form: AccountForm, { login, password }: Credential): FillResult {
  const username = form.username ? setText(form.username, login) : true;
  const passwords = form.passwords.length
    ? form.passwords.map((el) => setText(el, password)).every(Boolean)
    : true;
  return { username, passwords };
}

/** Marketing, newsletters and talent-pool boxes are never ticked, whatever else is. */
export const NEVER_TICK =
  /newsletter|marketing|promotion|promocj|offers|oferty|updates|aktualno|job alerts|talent|future|przysz[łl]|other (jobs|positions|roles)|share my|partners?|third part|inne (oferty|stanowiska)|profil(ing|owan)/i;
const TERMS =
  /terms|conditions|privacy|policy|regulamin|polityk|warunk|zgadzam|akceptuj|accept|agree|przetwarzani|processing/i;

const isRequired = (el: HTMLInputElement, label: string): boolean =>
  el.required ||
  el.getAttribute('aria-required') === 'true' ||
  /\*|obowi[aą]zkow|required/i.test(label);

/**
 * Tick the boxes an account cannot be created without — terms, privacy notice, mandatory
 * processing consent — and nothing else. Returns what it ticked, for the report.
 */
export async function tickRequiredAgreements(scope: ParentNode): Promise<string[]> {
  const ticked: string[] = [];
  const boxes = [...scope.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  for (const box of boxes) {
    if (box.checked || !isVisible(box, false)) continue;
    const label = clean(labelFor(box)) || clean(box.closest('label')?.textContent);
    if (!label || NEVER_TICK.test(label)) continue;
    if (!(isRequired(box, label) || TERMS.test(label))) continue;
    if (await setChecked(box, true)) ticked.push(label.slice(0, 80));
  }
  return ticked;
}

/** A throw-away adapter that scopes the generic form filler to one sign-up block. */
export function accountAdapter(form: AccountForm): SiteAdapter {
  return {
    id: 'account',
    matchPatterns: [],
    matches: () => true,
    scope: () => form.scope,
    neverTick: NEVER_TICK,
  };
}
