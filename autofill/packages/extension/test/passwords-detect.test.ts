import { beforeEach, describe, expect, it } from 'vitest';
import { accountFormShown, findAccountForms, showsError } from '../src/passwords/detect';

const page = (html: string, url = 'https://jobs.example.com/') => {
  (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);
  document.body.innerHTML = html;
};
const kinds = () => findAccountForms(document).map((f) => f.kind);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('sign-in forms', () => {
  it('a plain e-mail + password form is a login, with the e-mail as username', () => {
    page(`<form><label>E-mail <input type="email" name="email"></label>
      <label>Password <input type="password" name="password"></label>
      <button type="submit">Sign in</button></form>`);
    const [form] = findAccountForms(document);
    expect(form?.kind).toBe('login');
    expect(form?.username?.name).toBe('email');
    expect(form?.submit?.textContent).toBe('Sign in');
  });

  it('autocomplete="current-password" settles it even without words on the page', () => {
    page(
      `<form><input name="u" autocomplete="username"><input type="password" autocomplete="current-password"><button>Go</button></form>`,
    );
    expect(kinds()).toEqual(['login']);
  });

  it('a password-only second step is a login with no username field', () => {
    page(`<form><input type="password" name="pw"><button type="submit">Continue</button></form>`);
    const [form] = findAccountForms(document);
    expect(form?.kind).toBe('login');
    expect(form?.username).toBeNull();
  });

  it('finds a login drawn without a <form> (a SPA modal)', () => {
    page(
      `<div class="modal"><h2>Log in</h2><input type="email" name="e"><input type="password" name="p"><button>Log in</button></div>`,
    );
    const [form] = findAccountForms(document);
    expect(form?.kind).toBe('login');
    expect(form?.username?.name).toBe('e');
  });
});

describe('sign-up forms', () => {
  it('password + confirmation is a sign-up', () => {
    page(
      `<form><input type="email" name="email"><input type="password" name="password"><input type="password" name="confirm"><button>Next</button></form>`,
    );
    expect(kinds()).toEqual(['signup']);
  });

  it('a single password under a "Create account" button is a sign-up', () => {
    page(
      `<form><h1>Create your account</h1><input type="email" name="e"><input type="password" name="p"><button type="submit">Create account</button></form>`,
    );
    expect(kinds()).toEqual(['signup']);
  });

  it('autocomplete="new-password" alone marks a sign-up', () => {
    page(
      `<form><input type="email"><input type="password" autocomplete="new-password"><button>Continue</button></form>`,
    );
    expect(kinds()).toEqual(['signup']);
  });

  it('Polish wording: "Załóż konto" is a sign-up, "Zaloguj się" a login', () => {
    page(`<form><input type="email"><input type="password"><button>Załóż konto</button></form>`);
    expect(kinds()).toEqual(['signup']);
    page(`<form><input type="email"><input type="password"><button>Zaloguj się</button></form>`);
    expect(kinds()).toEqual(['login']);
  });

  it('collects every e-mail-ish box so "confirm e-mail" can be filled too', () => {
    page(
      `<form><input type="email" name="email"><input type="email" name="email2" placeholder="Repeat e-mail"><input type="password"><input type="password"><button>Register</button></form>`,
    );
    expect(findAccountForms(document)[0]?.emails.map((e) => e.name)).toEqual(['email', 'email2']);
  });
});

describe('what is not ours', () => {
  it('a change-password form (current + new + confirm) is left alone', () => {
    page(
      `<form><input type="password" autocomplete="current-password"><input type="password" autocomplete="new-password"><input type="password" autocomplete="new-password"><button>Save</button></form>`,
    );
    expect(kinds()).toEqual(['change']);
  });

  it('ignores anti-autofill honeypots and hidden fields', () => {
    page(`<form><input type="text" name="fakeuser" style="display:none"><input type="password" name="fakepass" style="display:none">
      <input type="email" name="email"><input type="password" name="password"><button>Sign in</button></form>`);
    const forms = findAccountForms(document);
    expect(forms).toHaveLength(1);
    expect(forms[0]?.passwords.map((p) => p.name)).toEqual(['password']);
  });

  it('on a page with both forms only the VISIBLE one counts', () => {
    page(`<form id="in"><input type="email"><input type="password"><button>Sign in</button></form>
      <form id="up" style="display:none"><input type="email"><input type="password"><input type="password"><button>Register</button></form>`);
    expect(kinds()).toEqual(['login']);
  });

  it('a page with no password field and no sign-in wording has no account form', () => {
    page(`<form><input type="text" name="q"><button>Search</button></form>`);
    expect(kinds()).toEqual([]);
  });
});

describe('first step of a two-step sign-in', () => {
  it('"e-mail → Continue" on a login page is an identifier step', () => {
    page(
      `<form><h1>Sign in</h1><input type="email" name="identifier"><button type="submit">Continue</button></form>`,
      'https://accounts.example.com/login',
    );
    const [form] = findAccountForms(document);
    expect(form?.kind).toBe('identifier');
    expect(form?.username?.name).toBe('identifier');
  });

  it('a newsletter box in a footer is not one', () => {
    page(
      `<footer><form><h3>Subscribe to our newsletter</h3><input type="email" name="email"><button>Subscribe</button></form></footer>`,
      'https://example.com/login',
    );
    expect(kinds()).toEqual([]);
  });

  it('a lone e-mail box on an ordinary page is not one', () => {
    page(
      `<form><input type="email" name="email"><button>Continue</button></form>`,
      'https://example.com/jobs/123',
    );
    expect(kinds()).toEqual([]);
  });
});

describe('did it work?', () => {
  it('sees an error message, and sees none when the page is quiet', () => {
    page(`<form><input type="password"><div role="alert">Invalid email or password</div></form>`);
    expect(showsError(document)).toBe(true);
    page(`<form><input type="password"><div role="alert"></div></form>`);
    expect(showsError(document)).toBe(false);
  });

  it('a static password-rules hint is not an error', () => {
    page(
      `<form><input type="password"><p class="hint">Password must contain 8 characters</p></form>`,
    );
    expect(showsError(document)).toBe(false);
  });

  it('accountFormShown is false once the form is gone', () => {
    page(`<form><input type="email"><input type="password"><button>Sign in</button></form>`);
    expect(accountFormShown(document)).toBe(true);
    document.body.innerHTML = '<main>Welcome back</main>';
    expect(accountFormShown(document)).toBe(false);
  });
});
