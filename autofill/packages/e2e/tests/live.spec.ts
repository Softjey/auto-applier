// Opt-in: LIVE=1. Opens REAL application forms, presses "Fill form" with the FAKE
// test profile, prints what each field holds, and stops. It never clicks a submit
// button — the fake data only ever lives in the page and is dropped on close.
import type { Page } from '@playwright/test';
import { expect, panel, test } from './harness';

interface Target {
  name: string;
  url: string;
  /** Steps that open the form (cookie bar, an Apply button that opens a modal). */
  open?: (page: Page) => Promise<void>;
}

const TARGETS: Target[] = [
  {
    name: 'traffit tsh',
    url: 'https://tsh.traffit.com/public/form/a/6e5f4c8d86e3f43c5830221f187bce39446b395a',
  },
  {
    name: 'traffit synergycodes',
    url: 'https://synergycodes.traffit.com/public/form/a/befa7dc25df522db5b444dcc1d5309206c70513d',
  },
  {
    name: 'traffit blazity',
    url: 'https://blazity.traffit.com/public/form/a/43f5f9a1e288ce4f5e193225ec308eb95043633d',
  },
  {
    name: 'erecruiter alten',
    url: 'https://system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?WebID=4e44998810b643b69d43d94f0c7a0f07',
  },
  {
    name: 'erecruiter wakacje',
    url: 'https://system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?WebID=a73da7a78aa64263829c6392e50e5d1c',
  },
  {
    name: 'erecruiter empik',
    url: 'https://form.erecruiter.pl/form/8ec9427f90384fc288a1bc4a1d86092e',
  },
  {
    name: 'greenhouse kalepa',
    url: 'https://job-boards.greenhouse.io/kalepa/jobs/4359670004',
  },
  {
    name: 'greenhouse firstconnect',
    url: 'https://job-boards.greenhouse.io/firstconnectinsurance/jobs/5196265008',
  },
  {
    name: 'ashby hostinger',
    url: 'https://jobs.ashbyhq.com/hostinger/57b7805f-412c-44fa-b8ac-6dc045a4e01d/application',
  },
  {
    name: 'ashby leovegas',
    url: 'https://jobs.ashbyhq.com/leovegasgroup/793c221b-d553-4bd0-bf12-a2fedbb06a62/application',
  },
  {
    name: 'lever spotify',
    url: 'https://jobs.lever.co/spotify/2193db3f-77c5-43b8-b030-8f92c9882bf1/apply',
  },
  {
    name: 'smartrecruiters softwaremind',
    url: 'https://jobs.smartrecruiters.com/oneclick-ui/company/SoftwareMind/publication/7d0ed70c-3874-4cf6-9a64-cd7637e19755?dcr_ci=SoftwareMind',
  },
  { name: 'bamboohr latentai', url: 'https://latentai.bamboohr.com/careers/40' },
  { name: 'comeet apply', url: 'https://www.comeet.co/jobs/B7.007/45.270/apply' },
  { name: 'solidjobs apply', url: 'https://solid.jobs/apply/37593/blackbird-fullstack-react-node' },
  {
    name: 'teamtailor flyps',
    url: 'https://flyps.teamtailor.com/jobs/8248547-senior-fullstack-engineer/89d2366a-b5b8-4a72-8b56-144e5d48fcc3',
    // the form mounts ~10 s after the page (ats/teamtailor.com.md)
    open: async (page) => {
      // "Apply now" only expands the form in place; nothing is sent.
      await page
        .getByRole('link', { name: /apply now/i })
        .first()
        .click({ timeout: 8000 })
        .catch(() => undefined);
      await page.locator('input[name="candidate[email]"]').waitFor({ timeout: 25_000 });
    },
  },
  {
    name: 'justjoin altimetrik',
    url: 'https://justjoin.it/job-offer/altimetrik-poland-senior-react-developer-krakow-javascript-c6d7cd5b',
    open: async (page) => {
      await page.waitForTimeout(2500);
      // The cookie dialog overlays the page and swallows pointer events: force past it.
      await page
        .getByRole('button', { name: 'Decline all' })
        .click({ force: true, timeout: 4000 })
        .catch(() => undefined);
      // The first click on Apply is often swallowed (ats/justjoin.it.md): click, probe, click again.
      const apply = page.locator('button:has-text("Apply")').filter({ visible: true }).first();
      const form = page.locator('input[name=name]');
      for (let i = 0; i < 5; i++) {
        await apply.click({ force: true, timeout: 4000 }).catch(() => undefined);
        if (
          await form.waitFor({ timeout: 3000 }).then(
            () => true,
            () => false,
          )
        )
          break;
      }
    },
  },
];

const only = process.env['ONLY'];

test.describe('live forms (fake data, never submitted)', () => {
  test.skip(!process.env['LIVE'], 'set LIVE=1 to run against real sites');
  test.setTimeout(120_000);

  for (const target of TARGETS.filter((t) => !only || t.name.includes(only))) {
    test(target.name, async ({ page }) => {
      const t0 = Date.now();
      await page.goto(target.url, { waitUntil: 'domcontentloaded' });
      const tLoad = Date.now() - t0;
      await target.open?.(page);
      // system.erecruiter.pl redirects to form.erecruiter.pl: wait for the page to settle,
      // or the click lands on a panel that is about to be replaced.
      await page.waitForLoadState('load', { timeout: 8000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      await expect(panel(page), 'panel should mount on a form page').toBeVisible({
        timeout: 15_000,
      });

      const tPanel = Date.now() - t0;
      const options = await panel(page).getByRole('combobox').locator('option').allTextContents();
      if (options.length > 1) await panel(page).getByRole('combobox').selectOption({ index: 1 });
      await panel(page).getByRole('button', { name: 'Fill form' }).click();
      await expect(
        panel(page).getByTestId('summary').or(panel(page).locator('.af-err')),
      ).toBeVisible({
        timeout: 45_000,
      });

      const summary = (await panel(page).textContent()) ?? '';
      const all = await panel(page).locator('details li').allTextContents();
      const fields = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLInputElement>('input, select, textarea')]
          .filter((e) => e.type !== 'hidden' && !/-selectized$/.test(e.id))
          .map((e) => ({
            k: (e.name || e.id).slice(-28),
            lab: (
              (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent) ||
              e.closest('label')?.textContent ||
              e.closest('.form-group')?.textContent ||
              ''
            )
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 70),
            t: e.type || e.tagName,
            v:
              e.type === 'file'
                ? `${e.files?.length ?? 0} file`
                : e.type === 'checkbox' || e.type === 'radio'
                  ? String(e.checked)
                  : (e as HTMLInputElement).value.slice(0, 28),
            sel: (e as HTMLElement).dataset['chosen'] ?? '',
          })),
      );
      console.log(
        `\n=== ${target.name} (dom ${tLoad}ms, panel ${tPanel}ms)\n${summary}\nALL:\n  ${all.join('\n  ')}\n${fields.map((f) => `  ${f.t.padEnd(14)} ${f.k.padEnd(30)} ${f.v} ${f.sel} | ${f.lab}`).join('\n')}`,
      );
    });
  }
});
