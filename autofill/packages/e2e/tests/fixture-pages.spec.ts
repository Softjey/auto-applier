import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, panel, serveFixture, test } from './harness';

const fixture = (name: string) =>
  readFileSync(resolve(import.meta.dirname, '../../extension/test/fixtures', name), 'utf8');

const fill = async (page: import('@playwright/test').Page) => {
  await expect(panel(page)).toBeVisible();
  await panel(page).getByRole('button', { name: 'Fill form' }).click();
  await expect(panel(page).getByText(/filled/)).toBeVisible();
};

// What real Traffit gives the page world: a selectize API on the native <select>.
const SELECTIZE = `<script>
  const s = document.querySelector('select.selectized');
  s.selectize = {
    options: { a1: { id: 'a1', title: 'Od zaraz' }, a2: { id: 'a2', title: '2 tygodnie' } },
    setValue(id) { s.dataset.chosen = id; },
  };
</script>`;

test.describe('the real extension in a real Chromium, on fixture pages', () => {
  test('traffit: fills text, ticks only the mandatory consent, attaches the CV, lists the rest', async ({
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
    await fill(page);

    await expect(page.locator('#f1')).toHaveValue('Test');
    await expect(page.locator('#f2')).toHaveValue('Candidate');
    await expect(page.locator('#f3')).toHaveValue('test.candidate@example.invalid');
    const [consent, future] = await page.locator('input[type=checkbox]').all();
    await expect(consent!).toBeChecked();
    await expect(future!).not.toBeChecked();
    expect(await page.locator('#f4').evaluate((el: HTMLInputElement) => el.files?.length)).toBe(1);
    await expect(panel(page).getByText('CV attached')).toBeVisible();
    // "Dostępność" is a fact the profile has no exact answer for: it must be handed to the human.
    await expect(panel(page).getByText(/Needs you/)).toBeVisible();
    await expect(page.locator('#f5')).not.toHaveAttribute('data-chosen', /.+/);
  });

  test('traffit: a page the adapter does not claim gets no panel', async ({ context, page }) => {
    await serveFixture(
      context,
      'https://demo.traffit.com/public/an/abc',
      '<h1>Job description</h1>',
    );
    await page.goto('https://demo.traffit.com/public/an/abc');
    await expect(page.locator('applier-autofill')).toHaveCount(0);
  });

  test('erecruiter (legacy): honeypot and referral stay empty, real fields fill', async ({
    context,
    page,
  }) => {
    await serveFixture(
      context,
      'https://system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?WebID=x',
      fixture('erecruiter-legacy.html'),
    );
    await page.goto('https://system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?WebID=x');
    await fill(page);

    await expect(page.locator('[name$="tbFirstName"]')).toHaveValue('Test');
    await expect(page.locator('[name$="tbEmail"]')).toHaveValue('test.candidate@example.invalid');
    await expect(page.locator('[name="fakeusernameremembered"]')).toHaveValue('');
    await expect(page.locator('[name$="ctl61$tbText"]')).toHaveValue('');
  });

  test('justjoin: acts inside the modal only and never ticks the account box', async ({
    context,
    page,
  }) => {
    await serveFixture(context, 'https://justjoin.it/job-offer/acme-dev', fixture('justjoin.html'));
    await page.goto('https://justjoin.it/job-offer/acme-dev');
    await fill(page);

    await expect(page.locator('[name=name]')).toHaveValue('Test Candidate');
    await expect(page.locator('[name=email]')).toHaveValue('test.candidate@example.invalid');
    await expect(page.locator('[name=q]')).toHaveValue('');
    await expect(page.locator('[name=account]')).not.toBeChecked();
    await expect(page.locator('[name=consent]')).toBeChecked();
  });

  test('nofluffjobs: labels anonymous inputs by position and leaves checkboxes alone', async ({
    context,
    page,
  }) => {
    await serveFixture(
      context,
      'https://nofluffjobs.com/pl/job/dev-acme-warszawa',
      fixture('nofluffjobs.html'),
    );
    await page.goto('https://nofluffjobs.com/pl/job/dev-acme-warszawa');
    await fill(page);

    const inputs = page.locator('[role=dialog] input:not([type=checkbox])');
    await expect(inputs.nth(0)).toHaveValue('Test Candidate');
    await expect(inputs.nth(1)).toHaveValue('test.candidate@example.invalid');
    await expect(inputs.nth(2)).toHaveValue('+48 000 000 000');
    await expect(page.locator('input[type=checkbox]')).not.toBeChecked();
  });

  test('an SPA route change to an offer page mounts the panel without a reload', async ({
    context,
    page,
  }) => {
    await serveFixture(context, 'https://justjoin.it/', '<h1>Offers</h1>');
    await serveFixture(context, 'https://justjoin.it/job-offer/acme-dev', fixture('justjoin.html'));
    await page.goto('https://justjoin.it/');
    await expect(page.locator('applier-autofill')).toHaveCount(0);
    await page.evaluate(() => history.pushState({}, '', '/job-offer/acme-dev'));
    await expect(page.locator('applier-autofill')).toHaveCount(1);
  });
});
