import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LoginSummary } from '@applier/protocol';
import type { CredsBackend } from '../src/core/messaging';
import { PasswordController } from '../src/passwords/controller';
import { fakeBackend, when } from './helpers';

const LOGIN_FORM = `<form><label>E-mail <input type="email" name="email" id="email"></label>
  <label>Password <input type="password" name="password" id="pw"></label>
  <button type="submit" id="go">Sign in</button></form>`;

const SIGNUP_FORM = `<form><h1>Create account</h1>
  <label>First name <input type="text" name="first"></label>
  <label>E-mail <input type="email" name="email" id="email"></label>
  <label>Confirm e-mail <input type="email" name="email2" id="email2"></label>
  <label>Password <input type="password" name="pw1" id="pw1"></label>
  <label>Repeat password <input type="password" name="pw2" id="pw2"></label>
  <label><input type="checkbox" id="terms" required> I accept the Terms and Conditions *</label>
  <label><input type="checkbox" id="news"> Send me our newsletter and job alerts</label>
  <button type="submit">Create account</button></form>`;

const login = (over: Partial<LoginSummary> = {}): LoginSummary => ({
  id: 'L1',
  domain: 'jobs.example.com',
  login: 'me@example.invalid',
  level: 'exact',
  verified: true,
  lastUsedAt: null,
  ...over,
});

function makeCreds(matches: LoginSummary[] = []) {
  const calls: string[] = [];
  const creds: CredsBackend & { calls: string[] } = {
    calls,
    match: async () => ({ matches }),
    reveal: async (id) => {
      calls.push(`reveal:${id}`);
      return { login: 'me@example.invalid', password: 'S3cret-pass' };
    },
    draft: async (o) => {
      calls.push(`draft:${JSON.stringify(o ?? {})}`);
      return { id: 'D1', login: 'me@example.invalid', password: 'Gen-erated-Pw-1' };
    },
    verified: async () => ({ ok: true }),
    forget: async (id) => void calls.push(`forget:${id}`),
    pendingSet: async (p) => void calls.push(`pendingSet:${JSON.stringify(p)}`),
    pendingGet: async () => ({ pending: null }),
    pendingOutcome: async (ok) => {
      calls.push(`outcome:${ok}`);
      return { action: 'none' };
    },
    pendingCommit: async () => ({ id: 'X', result: 'created' as const }),
    pendingClear: async () => void calls.push('clear'),
  };
  return creds;
}

const make = (creds: CredsBackend, topFrame = true) =>
  new PasswordController({
    doc: document,
    creds,
    backend: fakeBackend([
      when(/first name/i, () => ({ action: 'set', value: 'Test', source: 'profile' })),
    ]),
    topFrame,
    sleep: async () => undefined,
    settleMs: 0,
  });

const val = (id: string) => (document.getElementById(id) as HTMLInputElement).value;

beforeEach(() => {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(
    'https://jobs.example.com/login',
  );
  document.body.innerHTML = '';
});

describe('filling a saved login', () => {
  it('fills by itself when exactly one exact-host login fits', async () => {
    document.body.innerHTML = LOGIN_FORM;
    const creds = makeCreds([login()]);
    await make(creds).start();
    expect(val('email')).toBe('me@example.invalid');
    expect(val('pw')).toBe('S3cret-pass');
    expect(creds.calls.filter((c) => c.startsWith('reveal'))).toHaveLength(1);
  });

  it('does not fill silently when two logins fit — it waits for a choice', async () => {
    document.body.innerHTML = LOGIN_FORM;
    const creds = makeCreds([login(), login({ id: 'L2', login: 'other@example.invalid' })]);
    const c = make(creds);
    await c.start();
    expect(val('pw')).toBe('');
    await c.fillWith('L2');
    expect(val('pw')).toBe('S3cret-pass');
  });

  it('never fills silently from a merely "related" host', async () => {
    document.body.innerHTML = LOGIN_FORM;
    const creds = makeCreds([login({ level: 'related', domain: 'accounts.example.com' })]);
    await make(creds).start();
    expect(val('pw')).toBe('');
  });

  it('never fills silently inside an iframe', async () => {
    document.body.innerHTML = LOGIN_FORM;
    await make(makeCreds([login()]), false).start();
    expect(val('pw')).toBe('');
  });

  it('fills only the password on a password-only second step', async () => {
    document.body.innerHTML =
      '<form><input type="password" id="pw"><button type="submit">Continue</button></form>';
    await make(makeCreds([login()])).start();
    expect(val('pw')).toBe('S3cret-pass');
  });

  it('a server that is down shows as offline, not as a crash', async () => {
    document.body.innerHTML = LOGIN_FORM;
    const creds = makeCreds();
    creds.match = async () => {
      throw new Error('down');
    };
    const c = make(creds);
    await c.start();
    expect(c.getState().offline).toBe(true);
  });
});

describe('creating an account', () => {
  it('fills e-mail twice, both passwords with ONE generated password, and profile facts', async () => {
    document.body.innerHTML = SIGNUP_FORM;
    const creds = makeCreds();
    const c = make(creds);
    await c.start();
    expect(c.getState().form).toBe('signup');
    await c.createAccount();
    expect(val('email')).toBe('me@example.invalid');
    expect(val('email2')).toBe('me@example.invalid');
    expect(val('pw1')).toBe('Gen-erated-Pw-1');
    expect(val('pw2')).toBe('Gen-erated-Pw-1');
    expect((document.querySelector('[name=first]') as HTMLInputElement).value).toBe('Test');
    expect(c.getState().signup?.login).toBe('me@example.invalid');
  });

  it('ticks the required terms box and never the newsletter / job-alerts one', async () => {
    document.body.innerHTML = SIGNUP_FORM;
    const c = make(makeCreds());
    await c.start();
    await c.createAccount();
    expect((document.getElementById('terms') as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById('news') as HTMLInputElement).checked).toBe(false);
  });

  it("asks the server for a password that fits the field's maxlength", async () => {
    document.body.innerHTML = SIGNUP_FORM.replace('id="pw1"', 'id="pw1" maxlength="16"');
    const creds = makeCreds();
    const c = make(creds);
    await c.start();
    await c.createAccount({ alphanumeric: true, regenerate: true });
    expect(creds.calls.find((x) => x.startsWith('draft'))).toBe(
      'draft:{"length":16,"alphanumeric":true,"regenerate":true}',
    );
  });

  it('refuses on a page that has no sign-up form', async () => {
    document.body.innerHTML = LOGIN_FORM;
    const c = make(makeCreds());
    await c.start();
    await c.createAccount();
    expect(c.getState().notice?.kind).toBe('error');
  });
});

describe('saving after a successful sign-in', () => {
  it('remembers what was submitted, and offers to save once the form is gone', async () => {
    document.body.innerHTML = LOGIN_FORM;
    const creds = makeCreds();
    creds.pendingOutcome = async (ok) => {
      creds.calls.push(`outcome:${ok}`);
      return {
        action: 'offer-save',
        mode: 'new',
        login: 'me@example.invalid',
        host: 'jobs.example.com',
      };
    };
    const c = make(creds);
    await c.start();
    (document.getElementById('email') as HTMLInputElement).value = 'me@example.invalid';
    (document.getElementById('pw') as HTMLInputElement).value = 'typed-by-hand';
    document.getElementById('go')!.click();
    await vi.waitFor(() => expect(creds.calls.some((x) => x.startsWith('pendingSet'))).toBe(true));
    expect(creds.calls.find((x) => x.startsWith('pendingSet'))).toBe(
      'pendingSet:{"login":"me@example.invalid","password":"typed-by-hand","signup":false}',
    );
    document.body.innerHTML = '<main>Welcome back</main>'; // the SPA moved on
    await vi.waitFor(() =>
      expect(c.getState().prompt).toEqual({
        mode: 'new',
        login: 'me@example.invalid',
        host: 'jobs.example.com',
      }),
    );
    expect(creds.calls).toContain('outcome:true');
  });

  it('reports a failure when the page shows an error instead', async () => {
    document.body.innerHTML = LOGIN_FORM + '<div role="alert">Invalid email or password</div>';
    const creds = makeCreds();
    const c = make(creds);
    await c.start();
    (document.getElementById('pw') as HTMLInputElement).value = 'wrong';
    (document.getElementById('email') as HTMLInputElement).value = 'me@example.invalid';
    document.getElementById('go')!.click();
    await vi.waitFor(() => expect(creds.calls).toContain('outcome:false'));
    expect(c.getState().prompt).toBeNull();
  });

  it('a new page after a submit is judged on load: no form left means it worked', async () => {
    document.body.innerHTML = '<main>Your applications</main>';
    const creds = makeCreds();
    creds.pendingGet = async () => ({
      pending: {
        login: 'me@example.invalid',
        signup: false,
        origin: 'https://jobs.example.com',
        at: Date.now(),
      },
    });
    await make(creds).start();
    expect(creds.calls).toContain('outcome:true');
  });

  it('…and a form that is still there means it did not', async () => {
    document.body.innerHTML = LOGIN_FORM;
    const creds = makeCreds();
    creds.pendingGet = async () => ({
      pending: {
        login: 'me@example.invalid',
        signup: false,
        origin: 'https://jobs.example.com',
        at: Date.now(),
      },
    });
    await make(creds).start();
    expect(creds.calls).toContain('outcome:false');
  });

  it('a first-step e-mail submit is remembered without a password', async () => {
    document.body.innerHTML =
      '<form><h1>Sign in</h1><input type="email" id="id" name="identifier"><button type="submit" id="go">Continue</button></form>';
    const creds = makeCreds();
    const c = make(creds);
    await c.start();
    (document.getElementById('id') as HTMLInputElement).value = 'me@example.invalid';
    document.getElementById('go')!.click();
    await vi.waitFor(() => expect(creds.calls.some((x) => x.startsWith('pendingSet'))).toBe(true));
    expect(creds.calls.find((x) => x.startsWith('pendingSet'))).toBe(
      'pendingSet:{"login":"me@example.invalid","password":"","signup":false}',
    );
  });
});
