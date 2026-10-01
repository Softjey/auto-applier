import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, expect, passwords, serveFixture, test } from './harness';

const CREDS = join(DATA_DIR, 'credentials.json');
const stored = () =>
  (JSON.parse(readFileSync(CREDS, 'utf8')) as { entries: Record<string, unknown>[] }).entries;

test.beforeEach(() => rmSync(CREDS, { force: true }));

const LOGIN = `<form id="f" method="post" action="/welcome">
  <label>E-mail <input type="email" name="email" id="email"></label>
  <label>Password <input type="password" name="password" id="pw"></label>
  <button type="submit">Sign in</button></form>`;

test.describe('the password manager in a real Chromium, on fixture pages', () => {
  test('fills a saved login by itself on an employer portal that is not a supported ATS', async ({
    context,
    page,
  }) => {
    writeFileSync(
      CREDS,
      JSON.stringify({
        $schemaVersion: 1,
        entries: [
          {
            domain: 'careers.acme.test',
            company: 'Acme',
            login: 'me@example.invalid',
            password: 'Saved-Pw-123',
            createdAt: '2026-09-01',
          },
        ],
      }),
    );
    await serveFixture(context, 'https://careers.acme.test/login', LOGIN);
    await page.goto('https://careers.acme.test/login');

    await expect(page.locator('#email')).toHaveValue('me@example.invalid');
    await expect(page.locator('#pw')).toHaveValue('Saved-Pw-123');
    await expect(passwords(page)).toContainText('Filled login me@example.invalid');
  });

  test('does not fill a login saved for another site', async ({ context, page }) => {
    writeFileSync(
      CREDS,
      JSON.stringify({
        entries: [
          {
            domain: 'careers.acme.test',
            login: 'a@b.c',
            password: 'nope',
            createdAt: '2026-09-01',
          },
        ],
      }),
    );
    await serveFixture(context, 'https://careers.evil-acme.test/login', LOGIN);
    await page.goto('https://careers.evil-acme.test/login');
    await expect(passwords(page)).toBeVisible();
    await expect(page.locator('#pw')).toHaveValue('');
  });

  test('creates an account: generated password in both boxes, terms ticked, newsletter not, saved at once', async ({
    context,
    page,
  }) => {
    await serveFixture(
      context,
      'https://jobs.newco.test/register',
      `<form><h1>Create account</h1>
        <label>First name <input type="text" name="first"></label>
        <label>E-mail <input type="email" name="email" id="email"></label>
        <label>Password <input type="password" name="pw1" id="pw1"></label>
        <label>Confirm password <input type="password" name="pw2" id="pw2"></label>
        <label><input type="checkbox" id="terms" required> I accept the Terms *</label>
        <label><input type="checkbox" id="news"> Send me job alerts and newsletters</label>
        <button type="submit">Create account</button></form>`,
    );
    await page.goto('https://jobs.newco.test/register');
    await passwords(page).getByRole('button', { name: 'Create account' }).click();
    await expect(passwords(page).getByTestId('pw-signup')).toBeVisible();

    await expect(page.locator('[name=first]')).toHaveValue('Test');
    await expect(page.locator('#email')).toHaveValue('test.candidate@example.invalid');
    const password = await page.locator('#pw1').inputValue();
    expect(password).toHaveLength(20);
    await expect(page.locator('#pw2')).toHaveValue(password);
    await expect(page.locator('#terms')).toBeChecked();
    await expect(page.locator('#news')).not.toBeChecked();

    // stored BEFORE any submit: a failed submit must not lose the password
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({
      domain: 'jobs.newco.test',
      login: 'test.candidate@example.invalid',
      password,
      verified: false,
    });
  });

  test('after a successful sign-in (page navigates away) it offers to save, and saves', async ({
    context,
    page,
  }) => {
    await serveFixture(context, 'https://portal.fresh.test/login', LOGIN);
    await serveFixture(
      context,
      'https://portal.fresh.test/welcome',
      '<main>Your applications</main>',
    );
    await page.goto('https://portal.fresh.test/login');
    await expect(passwords(page)).toContainText('No saved login');

    await page.locator('#email').fill('me@example.invalid');
    await page.locator('#pw').fill('Typed-By-Hand-9');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Your applications')).toBeVisible();
    await expect(page.locator('applier-passwords').getByTestId('pw-prompt')).toContainText(
      'Save password?',
    );
    await passwords(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(passwords(page)).toContainText('Saved login');
    expect(stored()[0]).toMatchObject({
      domain: 'portal.fresh.test',
      login: 'me@example.invalid',
      password: 'Typed-By-Hand-9',
      verified: true,
    });
  });

  test('a wrong password (the page shows an error) is not offered for saving', async ({
    context,
    page,
  }) => {
    await serveFixture(
      context,
      'https://portal.failing.test/login',
      `${LOGIN}<script>
        document.getElementById('f').addEventListener('submit', (e) => {
          e.preventDefault();
          const a = document.createElement('div');
          a.setAttribute('role', 'alert');
          a.textContent = 'Invalid email or password';
          document.body.append(a);
        });
      </script>`,
    );
    await page.goto('https://portal.failing.test/login');
    await page.locator('#email').fill('me@example.invalid');
    await page.locator('#pw').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.locator('applier-passwords').getByTestId('pw-prompt')).toHaveCount(0);
    expect(() => stored()).toThrow(); // nothing was written
  });

  test('a page with no account form gets no widget at all', async ({ context, page }) => {
    await serveFixture(
      context,
      'https://news.example.test/',
      '<h1>Hello</h1><input type="text" name="q">',
    );
    await page.goto('https://news.example.test/');
    await page.waitForTimeout(500);
    await expect(page.locator('applier-passwords')).toHaveCount(0);
  });
});
