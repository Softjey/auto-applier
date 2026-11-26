// Opt-in: LIVE=1. Opens REAL sign-in / sign-up pages with the built extension, a FAKE saved
// login and the isolated test server, and checks what the password manager did. It never
// submits anything: nothing is typed into a real account, and the fake data only ever lives
// in the page and is dropped on close.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, expect, passwords, test } from './harness';

/** 'any': whatever the page shows — but a visible password box must get a panel. */
type Expect = 'login' | 'signup' | 'identifier' | 'any';
interface Target {
  name: string;
  url: string;
  expect: Expect;
  /** The host the page ends on, when it redirects (single sign-on): the fake login is saved for it. */
  seedHost?: string;
}

const FAKE = { login: 'fake.user@example.invalid', password: 'Fake-Seeded-Pw-1' };

const TARGETS: Target[] = [
  {
    name: 'hacker news (login + create account on one page)',
    url: 'https://news.ycombinator.com/login',
    expect: 'login',
  },
  { name: 'github', url: 'https://github.com/login', expect: 'login' },
  { name: 'gitlab', url: 'https://gitlab.com/users/sign_in', expect: 'login' },
  {
    name: 'wikipedia login',
    url: 'https://en.wikipedia.org/w/index.php?title=Special:UserLogin',
    expect: 'login',
    seedHost: 'auth.wikimedia.org',
  },
  {
    name: 'wikipedia create account',
    url: 'https://en.wikipedia.org/w/index.php?title=Special:CreateAccount',
    expect: 'signup',
  },
  { name: 'atlassian (two-step)', url: 'https://id.atlassian.com/login', expect: 'identifier' },
  { name: 'microsoft (two-step)', url: 'https://login.live.com/', expect: 'identifier' },
  { name: 'linkedin', url: 'https://www.linkedin.com/login', expect: 'login' },
  { name: 'reddit', url: 'https://www.reddit.com/login/', expect: 'login' },
  {
    name: 'greenhouse candidate portal',
    url: 'https://my.greenhouse.io/users/sign_in',
    expect: 'any',
  },
  { name: 'smartrecruiters', url: 'https://www.smartrecruiters.com/user/login', expect: 'any' },
  { name: 'bamboohr', url: 'https://www.bamboohr.com/login/', expect: 'any' },
  {
    name: 'workday tenant (nvidia)',
    url: 'https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite/login',
    expect: 'any',
  },
  {
    name: 'workday tenant (salesforce)',
    url: 'https://salesforce.wd12.myworkdayjobs.com/en-US/External_Career_Site/login',
    expect: 'any',
  },
  {
    name: 'avature (deloitte ce)',
    url: 'https://apply.deloittece.com/en_US/careers/Login',
    expect: 'any',
  },
  { name: 'teamtailor', url: 'https://app.teamtailor.com/users/sign_in', expect: 'any' },
  { name: 'join.com', url: 'https://join.com/login', expect: 'any' },
  { name: 'pracuj.pl', url: 'https://login.pracuj.pl/', expect: 'any' },
  { name: 'indeed', url: 'https://secure.indeed.com/auth', expect: 'any' },
  { name: 'stack overflow', url: 'https://stackoverflow.com/users/login', expect: 'login' },
];

const only = process.env['ONLY'];

test.describe('live sign-in / sign-up pages (fake data, never submitted)', () => {
  test.skip(!process.env['LIVE'], 'set LIVE=1 to run against real sites');
  test.setTimeout(90_000);

  for (const target of TARGETS.filter((t) => !only || t.name.includes(only))) {
    test(target.name, async ({ page }) => {
      const host = target.seedHost ?? new URL(target.url).hostname;
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(
        join(DATA_DIR, 'credentials.json'),
        JSON.stringify({
          entries: [
            { domain: host, login: FAKE.login, password: FAKE.password, createdAt: '2026-01-01' },
          ],
        }),
      );

      await page.goto(target.url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load', { timeout: 10_000 }).catch(() => undefined);
      await page.waitForTimeout(3000);

      const where = `${page.url()} — ${await page.title()}`;
      const inventory = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLInputElement>('input')]
          .filter(
            (e) => !['hidden', 'submit', 'button'].includes(e.type) && e.offsetParent !== null,
          )
          .map(
            (e) =>
              `${e.type}:${e.name || e.id}=${e.type === 'password' ? (e.value ? '<filled>' : '') : e.value}`,
          ),
      );
      const shown = await page.locator('applier-passwords').count();
      const text = shown
        ? ((await passwords(page)
            .textContent()
            .catch(() => '')) ?? '')
        : '';
      console.log(
        `\n=== ${target.name}\n  ${where}\n  panel: ${shown ? text.slice(0, 160) : '(none)'}\n  inputs: ${inventory.join(' | ')}`,
      );

      const title = await page.title();
      test.skip(
        /just a moment|attention required|verify you are|access denied|captcha|blocked/i.test(
          title,
        ) ||
          /js_challenge/.test(page.url()) ||
          (!title && (await page.locator('input:visible').count()) === 0) ||
          (await page.locator('body *').count()) < 5,
        `blocked by bot protection (${title || 'empty page'})`,
      );
      const visiblePassword = await page.locator('input[type=password]:visible').count();
      // a first step ("e-mail → Next") on a page that says it is a sign-in needs a panel too
      const signInEmail =
        /log\s?in|sign\s?in|logowanie|zaloguj/i.test(`${title} ${page.url()}`) &&
        (await page.locator('input[type=email]:visible, input[name*=mail i]:visible').count()) > 0;
      if (target.expect === 'any' && visiblePassword === 0 && !signInEmail) {
        console.log('  (no visible password box on this page: nothing required)');
        return;
      }
      await expect(passwords(page), `no panel on ${where}`).toBeVisible({ timeout: 5000 });
      if (target.expect === 'any') return;

      if (target.expect === 'signup') {
        await passwords(page).getByRole('button', { name: 'Create account' }).click();
        await expect(passwords(page).getByTestId('pw-signup')).toBeVisible({ timeout: 15_000 });
        const pws = await page
          .locator('input[type=password]:visible')
          .evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
        console.log(
          `  signup passwords: ${pws.map((p) => p.length).join(',')} (equal: ${new Set(pws).size === 1})`,
        );
        expect(pws.length).toBeGreaterThan(0);
        expect(new Set(pws).size).toBe(1);
        expect(pws[0]!.length).toBeGreaterThanOrEqual(12);
      } else {
        // a sign-in fills by itself: the username everywhere, the password when the form has one
        await expect(passwords(page)).toContainText('Filled login', { timeout: 8000 });
        const filled = await page
          .locator('input:visible')
          .evaluateAll((els) =>
            els.map((e) => [(e as HTMLInputElement).type, (e as HTMLInputElement).value]),
          );
        expect(filled.some(([, v]) => v === FAKE.login)).toBe(true);
        if (target.expect === 'login')
          expect(filled.some(([t, v]) => t === 'password' && v === FAKE.password)).toBe(true);
      }
    });
  }
});
