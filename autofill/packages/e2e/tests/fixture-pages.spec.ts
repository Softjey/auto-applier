import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, panel, serveFixture, test } from './harness';

const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, '../../extension/test/fixtures', name), 'utf8');

// What real Traffit gives the page world: a selectize API on the native <select>.
const SELECTIZE = `<script>
  const s = document.querySelector('select.selectized');
  s.selectize = {
    options: { a1: { id: 'a1', title: 'Od zaraz' }, a2: { id: 'a2', title: '2 tygodnie' } },
    setValue(id) { s.dataset.chosen = id; },
  };
</script>`;

test.describe('the real extension in a real Chromium, on fixture pages', () => {
  test('traffit: panel appears, fills text, drives selectize, ticks the mandatory consent, attaches the CV', async ({
    context,
    page,
  }) => {
    await serveFixture(
      context,
      'https://demo.traffit.com/public/form/a/abc',
      fixture('traffit.html') + SELECTIZE,
    );
    await page.goto('https://demo.traffit.com/public/form/a/abc');

    await expect(panel(page)).toBeVisible();
    await panel(page).getByRole('combobox').selectOption({ index: 1 }); // the fixture CV
    await panel(page).getByRole('button', { name: 'Fill form' }).click();
    await expect(panel(page).getByText(/filled/)).toBeVisible();

    await expect(page.locator('#f1')).toHaveValue('Test');
    await expect(page.locator('#f2')).toHaveValue('Candidate');
    await expect(page.locator('#f3')).toHaveValue('test.candidate@example.invalid');
    const [consent, future] = await page.locator('input[type=checkbox]').all();
    await expect(consent!).toBeChecked();
    await expect(future!).not.toBeChecked();
    expect(await page.locator('#f4').evaluate((el: HTMLInputElement) => el.files?.length)).toBe(1);
    await expect(panel(page).getByText('CV attached')).toBeVisible();
  });

  test('a page the adapter does not claim gets no panel', async ({ context, page }) => {
    await serveFixture(
      context,
      'https://demo.traffit.com/public/an/abc',
      '<h1>Job description</h1>',
    );
    await page.goto('https://demo.traffit.com/public/an/abc');
    await expect(page.locator('applier-autofill')).toHaveCount(0);
  });
});
