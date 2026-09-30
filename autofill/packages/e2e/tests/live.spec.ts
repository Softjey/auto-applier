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
      await page.waitForTimeout(2500);
      await expect(panel(page), 'panel should mount on a form page').toBeVisible({
        timeout: 15_000,
      });

      const tPanel = Date.now() - t0;
      const options = await panel(page).getByRole('combobox').locator('option').allTextContents();
      if (options.length > 1) await panel(page).getByRole('combobox').selectOption({ index: 1 });
      await panel(page).getByRole('button', { name: 'Fill form' }).click();
      await expect(panel(page).getByText(/filled|Plan server|failed/)).toBeVisible({
        timeout: 45_000,
      });

      const summary = await panel(page).innerText();
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
        `\n=== ${target.name}\n${summary}\n${fields.map((f) => `  ${f.t.padEnd(14)} ${f.k.padEnd(30)} ${f.v} ${f.sel} | ${f.lab}`).join('\n')}`,
      );
    });
  }
});
