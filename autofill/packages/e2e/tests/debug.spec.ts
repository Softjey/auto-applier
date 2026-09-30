import { test } from './harness';

for (const [name, url] of [
  ['empik', 'https://form.erecruiter.pl/form/8ec9427f90384fc288a1bc4a1d86092e'],
  ['alten', 'https://form.erecruiter.pl/form/4e44998810b643b69d43d94f0c7a0f07'],
  ['wakacje', 'https://form.erecruiter.pl/form/a73da7a78aa64263829c6392e50e5d1c'],
] as const) {
  test(`dump ${name}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(url, { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    console.log(
      `=== ${name}`,
      await page.evaluate(() => {
        const t = (n: Element | null) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();
        const out: string[] = [];
        for (const rg of document.querySelectorAll('[role=radiogroup]')) {
          const q = t(document.querySelector(`label[for="${rg.id}"]`));
          out.push(
            `RADIO "${q.slice(0, 90)}" -> ${[...rg.querySelectorAll('[role=radio]')].map((b) => t(b.parentElement)).join(' | ')}`,
          );
        }
        for (const cb of document.querySelectorAll('[role=checkbox]'))
          out.push(
            `CHECK ${cb.getAttribute('aria-required')} "${t(cb.parentElement).slice(0, 110)}"`,
          );
        for (const el of document.querySelectorAll('form textarea, form select'))
          out.push(
            `${el.tagName} ${(el as HTMLInputElement).name} "${t(document.querySelector(`label[for="${el.id}"]`)).slice(0, 80)}"`,
          );
        return out.join('\n');
      }),
    );
  });
}
