import type { LoginSummary } from '@applier/protocol';
import type { Backend, CredsBackend } from '../core/messaging';
import { fillForm } from '../core/run';
import { setText } from '../core/setters';
import {
  accountFormShown,
  buttonText,
  findAccountForms,
  showsError,
  type AccountForm,
} from './detect';
import { accountAdapter, fillLogin, tickRequiredAgreements } from './fill';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type PasswordSettings } from './settings';

export interface Notice {
  kind: 'ok' | 'info' | 'error';
  text: string;
}

export interface SignupReport {
  login: string;
  filled: number;
  ticked: string[];
  /** Fields only a person can answer, in page order. */
  manual: string[];
}

export interface PasswordsState {
  /** What the page shows right now; null when there is no account form. */
  form: AccountForm['kind'] | null;
  host: string;
  matches: LoginSummary[];
  busy: boolean;
  /** The worker could not reach the plan server. */
  offline: boolean;
  notice: Notice | null;
  prompt: { mode: 'new' | 'update'; login: string; host: string } | null;
  signup: SignupReport | null;
  settings: PasswordSettings;
}

export interface ControllerOptions {
  doc: Document;
  creds: CredsBackend;
  backend: Backend;
  /** Auto-fill only in the top frame: a cross-origin iframe never gets a silent fill. */
  topFrame: boolean;
  sleep?: (ms: number) => Promise<void>;
  /** How long the page gets to show whether a submit worked. */
  settleMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const SIGNUP_LENGTH = 20;

/**
 * The password manager for one page: finds sign-in / sign-up blocks, fills a saved login or a
 * freshly generated one, notices a submit and — once the page shows it worked — offers to save.
 * No DOM-framework code lives here, so the whole flow runs in a test DOM.
 */
export class PasswordController {
  state: PasswordsState;
  private listeners = new Set<() => void>();
  private autoFilled = new WeakSet<HTMLElement>();
  private matchesFor: string | null = null;
  private cleanups: (() => void)[] = [];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly settleMs: number;

  constructor(private readonly o: ControllerOptions) {
    this.sleep = o.sleep ?? defaultSleep;
    this.settleMs = o.settleMs ?? 1500;
    this.state = {
      form: null,
      host: o.doc.location?.hostname ?? '',
      matches: [],
      busy: false,
      offline: false,
      notice: null,
      prompt: null,
      signup: null,
      settings: DEFAULT_SETTINGS,
    };
  }

  // -- subscription -----------------------------------------------------------------------
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getState = (): PasswordsState => this.state;
  private set(patch: Partial<PasswordsState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  // -- lifecycle --------------------------------------------------------------------------
  async start(): Promise<void> {
    this.set({ settings: await loadSettings() });
    const { doc } = this.o;
    const onSubmit = (e: Event) => void this.capture(e.target as HTMLElement | null);
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      const control = target?.closest<HTMLElement>('button, input[type="submit"], [role="button"]');
      if (control) void this.capture(control, true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement) void this.capture(e.target);
    };
    doc.addEventListener('submit', onSubmit, true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    this.cleanups.push(
      () => doc.removeEventListener('submit', onSubmit, true),
      () => doc.removeEventListener('click', onClick, true),
      () => doc.removeEventListener('keydown', onKey, true),
    );
    await this.refresh();
    await this.checkPending();
  }

  stop(): void {
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    this.listeners.clear();
  }

  // -- what the page shows ----------------------------------------------------------------
  private primary(): AccountForm | null {
    return findAccountForms(this.o.doc).find((f) => f.kind !== 'change') ?? null;
  }

  /** Re-read the page; fill a login by itself when exactly one exact-host login fits. */
  async refresh(): Promise<void> {
    const form = this.primary();
    if (!form) {
      if (this.state.form !== null) this.set({ form: null });
      return;
    }
    const host = this.o.doc.location?.hostname ?? '';
    if (this.state.form !== form.kind || this.state.host !== host)
      this.set({ form: form.kind, host });
    if (this.matchesFor !== host) await this.loadMatches(host);

    const exact = this.state.matches.filter((m) => m.level === 'exact');
    const first = exact[0];
    if (
      first &&
      exact.length === 1 &&
      (form.kind === 'login' || form.kind === 'identifier') &&
      this.state.settings.autoFill &&
      this.o.topFrame &&
      !this.autoFilled.has(form.scope)
    ) {
      this.autoFilled.add(form.scope);
      await this.fillWith(first.id);
    }
  }

  private async loadMatches(host: string): Promise<void> {
    try {
      const { matches } = await this.o.creds.match();
      this.matchesFor = host;
      this.set({ matches, offline: false });
    } catch {
      this.set({ offline: true });
    }
  }

  // -- actions ----------------------------------------------------------------------------
  /** Fill a saved login into the sign-in block (the password never leaves this call). */
  async fillWith(id: string): Promise<void> {
    const form = this.primary();
    if (!form || form.kind === 'signup')
      return this.set({ notice: { kind: 'error', text: 'No sign-in form on this page.' } });
    this.set({ busy: true, notice: null });
    try {
      const cred = await this.o.creds.reveal(id);
      const result = fillLogin(form, cred);
      const ok = result.username && result.passwords;
      this.set({
        busy: false,
        notice: ok
          ? { kind: 'ok', text: `Filled login ${cred.login}.` }
          : {
              kind: 'error',
              text: 'The page did not keep the value — click the field and try again.',
            },
      });
    } catch (e) {
      this.set({ busy: false, notice: { kind: 'error', text: message(e) } });
    }
  }

  /** New account: generate a password, fill the e-mail, password(s), profile facts and required agreements. */
  async createAccount(opts: { regenerate?: boolean; alphanumeric?: boolean } = {}): Promise<void> {
    const form = this.primary();
    if (!form || form.kind !== 'signup') {
      return this.set({ notice: { kind: 'error', text: 'No sign-up form on this page.' } });
    }
    this.set({ busy: true, notice: null });
    try {
      const maxLen = Math.min(
        ...form.passwords.map((p) => (p.maxLength > 0 ? p.maxLength : SIGNUP_LENGTH)),
        SIGNUP_LENGTH,
      );
      const draft = await this.o.creds.draft({
        length: Math.max(12, maxLen),
        ...(opts.alphanumeric ? { alphanumeric: true } : {}),
        ...(opts.regenerate ? { regenerate: true } : {}),
      });
      const result = fillLogin(form, { login: draft.login, password: draft.password });
      // "Confirm e-mail" boxes and a second e-mail field get the same address.
      for (const email of form.emails) if (email !== form.username) setText(email, draft.login);
      const report = await fillForm({
        adapter: accountAdapter(form),
        backend: this.o.backend,
        doc: this.o.doc,
        cvId: null,
      });
      const ticked = await tickRequiredAgreements(form.scope);
      this.set({
        busy: false,
        matches: this.state.matches,
        signup: {
          login: draft.login,
          filled: report.outcomes.filter((o) => o.status === 'filled').length,
          ticked,
          manual: report.manual.map((m) => m.label || '(unlabelled field)'),
        },
        notice:
          result.username && result.passwords
            ? {
                kind: 'ok',
                text: `Account details filled for ${draft.login}. The password is already saved.`,
              }
            : { kind: 'error', text: 'The page did not keep every value — check the form.' },
      });
      await this.loadMatches(this.state.host);
    } catch (e) {
      this.set({ busy: false, notice: { kind: 'error', text: message(e) } });
    }
  }

  async forget(id: string): Promise<void> {
    try {
      await this.o.creds.forget(id);
      await this.loadMatches(this.state.host);
      this.set({ notice: { kind: 'info', text: 'Login removed.' } });
    } catch (e) {
      this.set({ notice: { kind: 'error', text: message(e) } });
    }
  }

  async setSetting(patch: Partial<PasswordSettings>): Promise<void> {
    this.set({ settings: await saveSettings(patch) });
  }

  // -- saving after a successful sign-in --------------------------------------------------
  /** A submit happened inside an account block: remember what was typed until we know it worked. */
  private async capture(target: HTMLElement | null, fromClick = false): Promise<void> {
    if (!target) return;
    const form = findAccountForms(this.o.doc).find((f) => f.scope.contains(target));
    if (!form || form.kind === 'change') return;
    if (fromClick && target !== form.submit && (target as HTMLButtonElement).type !== 'submit') {
      // A click on some other button (show password, social login, a link) is not a submit.
      if (
        !/sign|log|create|register|continue|next|submit|zaloguj|zarejestruj|dalej|utw/i.test(
          buttonText(target),
        )
      )
        return;
    }
    const password = form.passwords.map((p) => p.value).find(Boolean) ?? '';
    const login = form.username?.value.trim() ?? '';
    if (!password && !(form.kind === 'identifier' && login)) return;
    try {
      await this.o.creds.pendingSet({ login, password, signup: form.kind === 'signup' });
      void this.watchSubmit();
    } catch {
      /* server down: nothing to save, nothing to say */
    }
  }

  /** Same-document submit (a SPA): poll until the form goes away or an error shows. */
  private async watchSubmit(): Promise<void> {
    for (let waited = 0; waited < 8000; waited += 500) {
      await this.sleep(500);
      if (showsError(this.o.doc)) return void (await this.resolve(false));
      if (!accountFormShown(this.o.doc)) return void (await this.resolve(true));
    }
  }

  /** A fresh page after a submit: did we land somewhere the form is gone? */
  async checkPending(): Promise<void> {
    let pending;
    try {
      pending = (await this.o.creds.pendingGet()).pending;
    } catch {
      return;
    }
    if (!pending) return;
    await this.sleep(this.settleMs);
    await this.resolve(!showsError(this.o.doc) && !accountFormShown(this.o.doc));
  }

  private async resolve(success: boolean): Promise<void> {
    try {
      const outcome = await this.o.creds.pendingOutcome(success);
      if (outcome.action === 'offer-save') {
        this.set({ prompt: { mode: outcome.mode, login: outcome.login, host: outcome.host } });
      } else if (outcome.action === 'saved') {
        this.set({
          notice: { kind: 'ok', text: `Saved login ${outcome.login} for ${outcome.host}.` },
        });
        this.matchesFor = null;
      }
    } catch {
      /* the worker lost it; nothing to offer */
    }
  }

  async savePrompt(): Promise<void> {
    try {
      await this.o.creds.pendingCommit();
      const saved = this.state.prompt;
      this.set({
        prompt: null,
        notice: { kind: 'ok', text: `Saved login ${saved?.login ?? ''} for ${saved?.host ?? ''}.` },
      });
      this.matchesFor = null;
    } catch (e) {
      this.set({ prompt: null, notice: { kind: 'error', text: message(e) } });
    }
  }

  async dismissPrompt(neverForSite = false): Promise<void> {
    const host = this.state.prompt?.host;
    if (neverForSite && host) {
      await this.setSetting({ neverSave: [...this.state.settings.neverSave, host] });
    }
    await this.o.creds.pendingClear().catch(() => undefined);
    this.set({ prompt: null });
  }
}
