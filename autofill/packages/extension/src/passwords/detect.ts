import { clean } from '../core/text';
import { isHoneypotName, isVisible } from '../core/visibility';

/**
 * login      one password field: sign in
 * signup     a new password (and usually its confirmation): create an account
 * change     current + new password: not ours to touch
 * identifier a first step that asks only who you are ("Email → Next"); the password comes next
 */
export type FormKind = 'login' | 'signup' | 'change' | 'identifier';

export interface AccountForm {
  kind: FormKind;
  /** The <form>, or the smallest container around the fields when the page has no <form>. */
  scope: HTMLElement;
  /** The field that says who is signing in (null on a password-only step). */
  username: HTMLInputElement | null;
  /** Every e-mail-ish field, so a "confirm e-mail" box can be filled too. */
  emails: HTMLInputElement[];
  passwords: HTMLInputElement[];
  submit: HTMLElement | null;
}

// English, Polish, German, French, Spanish. Stems, not whole words: "zalogować" and "zaloguj się"
// are one verb (found on login.pracuj.pl, which a whole-word pattern missed).
const SIGNUP_WORDS =
  /sign\s?up|create\s+(an?\s+|your\s+)?(account|profile)|register|registration|join\b|get started|zarejestruj|rejestracj|za[łl][óo][żz]|utw[óo]rz|stw[óo]rz|nowe konto|nie masz konta|registrier|konto erstellen|cr[ée]er un compte|inscri|crear (una )?cuenta|registrarse/i;
const LOGIN_WORDS =
  /sign\s?in|log\s?in|login|zalog|logowan|loguj|masz ju[żz] konto|anmeld|einlogg|se connecter|connexion|iniciar sesi[óo]n/i;
const NEXT_WORDS = /next|continue|dalej|kontynu|weiter|continuer|continuar|siguiente/i;
/** A host that exists only to sign people in: login.example.com, accounts.example.com … */
const LOGIN_HOST = /^(login|signin|auth|accounts?|id|sso|secure|identity|connect|idp)\./i;
const NEWSLETTER = /newsletter|subscribe|subskry|zapisz si[ęe]|mailing|promo/i;
const USERNAME_HINT = /user(name)?|e-?mail|login|identifier|account|konto|adres/i;
const COOKIE_WIDGET =
  '#onetrust-consent-sdk, #CybotCookiebotDialog, [id*="cookie" i], [class*="cookie" i]';
const LOGIN_PATH = /log-?in|sign-?in|auth|session|sso|account|logowanie|konto|candidate|apply/i;

const tokens = (el: HTMLElement): string[] =>
  (el.getAttribute('autocomplete') ?? '').toLowerCase().split(/\s+/).filter(Boolean);

const visibleInputs = (root: ParentNode): HTMLInputElement[] =>
  [...root.querySelectorAll<HTMLInputElement>('input')].filter(
    (el) =>
      !['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio', 'file'].includes(
        el.type,
      ) &&
      !isHoneypotName(el.name) &&
      !el.closest(COOKIE_WIDGET) &&
      isVisible(el),
  );

/** The container a lone group of fields belongs to when the page has no <form>. */
function scopeOf(el: HTMLElement): HTMLElement {
  const form = el.closest('form');
  if (form) return form;
  let best: HTMLElement = el.parentElement ?? el;
  for (let node = el.parentElement, hops = 0; node && hops < 6; node = node.parentElement, hops++) {
    if (visibleInputs(node).length > 8 || node === node.ownerDocument.body) break;
    best = node;
  }
  return best;
}

/** What the page says about this block: buttons, headings, legends, and the form's own names. */
function contextText(scope: HTMLElement, submit: HTMLElement | null): string {
  const bits = [submit ? buttonText(submit) : ''];
  scope
    .querySelectorAll('h1, h2, h3, legend, [role="heading"], [role="tab"][aria-selected="true"]')
    .forEach((h) => bits.push(clean(h.textContent)));
  bits.push(scope.getAttribute('id') ?? '', scope.getAttribute('class') ?? '');
  bits.push(scope.getAttribute('action') ?? '', scope.getAttribute('aria-label') ?? '');
  // The heading often sits just outside a formless block.
  const prev = scope.previousElementSibling;
  if (prev && /^H[1-4]$/.test(prev.tagName)) bits.push(clean(prev.textContent));
  return bits.join(' ');
}

const buttonText = (el: HTMLElement): string =>
  clean(el instanceof HTMLInputElement ? el.value : el.textContent) ||
  clean(el.getAttribute('aria-label'));

function findSubmit(scope: HTMLElement): HTMLElement | null {
  const candidates = [
    ...scope.querySelectorAll<HTMLElement>(
      'button[type="submit"], input[type="submit"], button:not([type]), [role="button"], button',
    ),
  ].filter((b) => isVisible(b) && !(b as HTMLButtonElement).disabled);
  // A "Show password" toggle or a social button is not the form's submit.
  const real = candidates.filter(
    (b) =>
      !/show|hide|poka[żz]|ukryj|google|facebook|linkedin|apple|github|microsoft/i.test(
        buttonText(b),
      ),
  );
  return real.find((b) => (b as HTMLButtonElement).type === 'submit') ?? real[0] ?? null;
}

function pickUsername(scope: HTMLElement, before?: HTMLElement): HTMLInputElement | null {
  const fields = visibleInputs(scope).filter((el) => el.type !== 'password');
  if (!fields.length) return null;
  const score = (el: HTMLInputElement): number => {
    let s = 0;
    const t = tokens(el);
    if (t.includes('username') || t.includes('email')) s += 4;
    if (el.type === 'email') s += 3;
    if (USERNAME_HINT.test(`${el.name} ${el.id} ${el.placeholder}`)) s += 2;
    if (before && el.compareDocumentPosition(before) & Node.DOCUMENT_POSITION_FOLLOWING) s += 1;
    if (el.type === 'search' || /search|szukaj|captcha|code|kod/i.test(`${el.name} ${el.id}`))
      s -= 5;
    return s;
  };
  return [...fields].sort((a, b) => score(b) - score(a))[0] ?? null;
}

const isEmailish = (el: HTMLInputElement): boolean =>
  el.type === 'email' ||
  tokens(el).includes('email') ||
  /e-?mail/i.test(`${el.name} ${el.id} ${el.placeholder}`);

function classify(passwords: HTMLInputElement[], scope: HTMLElement, submit: HTMLElement | null) {
  const hints = passwords.flatMap(tokens);
  const hasNew = hints.includes('new-password');
  const hasCurrent = hints.includes('current-password');
  if (passwords.length >= 3 || (passwords.length === 2 && hasCurrent && hasNew)) return 'change';
  if (passwords.length === 2) return 'signup'; // password + confirmation
  if (hasNew && !hasCurrent) return 'signup';
  if (hasCurrent) return 'login';
  const context = contextText(scope, submit);
  // Both words on one page = a tabbed "Sign in | Register": the active button decides.
  if (submit && SIGNUP_WORDS.test(buttonText(submit)) && !LOGIN_WORDS.test(buttonText(submit))) {
    return 'signup';
  }
  if (submit && LOGIN_WORDS.test(buttonText(submit))) return 'login';
  return SIGNUP_WORDS.test(context) && !LOGIN_WORDS.test(context) ? 'signup' : 'login';
}

/** Every visible sign-in / sign-up / first-step block on the page, in page order. */
export function findAccountForms(doc: Document): AccountForm[] {
  const passwords = [...doc.querySelectorAll<HTMLInputElement>('input[type="password"]')].filter(
    (el) => !isHoneypotName(el.name) && !el.closest(COOKIE_WIDGET) && isVisible(el),
  );

  const groups = new Map<HTMLElement, HTMLInputElement[]>();
  for (const pw of passwords) {
    const scope = scopeOf(pw);
    groups.set(scope, [...(groups.get(scope) ?? []), pw]);
  }

  const forms: AccountForm[] = [];
  for (const [scope, pws] of groups) {
    const submit = findSubmit(scope);
    const username = pickUsername(scope, pws[0]);
    forms.push({
      kind: classify(pws, scope, submit),
      scope,
      username,
      emails: visibleInputs(scope).filter(isEmailish),
      passwords: pws,
      submit,
    });
  }

  if (!forms.length) {
    const step = findIdentifierStep(doc);
    if (step) forms.push(step);
  }
  return forms;
}

/**
 * "Enter your e-mail → Continue": no password yet. Only taken for a page that says it is a
 * sign-in — an e-mail box in a footer or a newsletter strip is not one.
 */
function findIdentifierStep(doc: Document): AccountForm | null {
  const loginPage =
    LOGIN_PATH.test(doc.location?.pathname ?? '') ||
    LOGIN_HOST.test(doc.location?.hostname ?? '') ||
    LOGIN_WORDS.test(doc.title);
  // Cheap attribute tests first: this runs on every page change, and the visibility
  // check (computed style) is the expensive part.
  const candidates = [...doc.querySelectorAll<HTMLInputElement>('input')].filter(
    (el) =>
      ['text', 'email', 'tel', ''].includes(el.type) &&
      (isEmailish(el) ||
        tokens(el).includes('username') ||
        /user|login|identifier/i.test(`${el.name} ${el.id}`)),
  );
  for (const input of candidates) {
    if (isHoneypotName(input.name) || input.closest(COOKIE_WIDGET) || !isVisible(input)) continue;
    if (input.closest('footer, [role="contentinfo"], nav')) continue;
    const scope = scopeOf(input);
    if (visibleInputs(scope).length > 2) continue; // a real form with more to fill
    const submit = findSubmit(scope);
    const context = contextText(scope, submit);
    if (NEWSLETTER.test(context)) continue;
    const says = LOGIN_WORDS.test(context) || (loginPage && NEXT_WORDS.test(context));
    if (!says || SIGNUP_WORDS.test(buttonText(submit ?? scope))) continue;
    return { kind: 'identifier', scope, username: input, emails: [input], passwords: [], submit };
  }
  return null;
}

const ERROR_TEXT =
  /invalid|incorrect|wrong|failed|not (found|recogni[sz]ed|match)|doesn'?t match|already (exists?|registered|in use|taken)|nieprawid[łl]ow|b[łl][ęe]dn|niepoprawn|spr[óo]buj ponownie|try again|zaj[ęe]t|istnieje/i;

/** Does the page currently show a validation / authentication error? */
export function showsError(doc: Document): boolean {
  const candidates = doc.querySelectorAll<HTMLElement>(
    '[role="alert"], [aria-live="assertive"], [aria-invalid="true"], .error, .errors, [class*="error" i], [class*="invalid" i], [class*="alert" i], [data-error], [id*="error" i]',
  );
  for (const el of candidates) {
    if (el.getAttribute('aria-invalid') === 'true') return true;
    if (isVisible(el) && ERROR_TEXT.test(clean(el.textContent))) return true;
  }
  return false;
}

/** Is any account form (password step included) still on screen? */
export const accountFormShown = (doc: Document): boolean =>
  findAccountForms(doc).some((f) => f.kind === 'login' || f.kind === 'signup');

export { buttonText };
