import { beforeEach, describe, expect, it } from 'vitest';
import { justjoin } from '../src/adapters/justjoin';
import { openForm } from '../src/core/open-form';
import { pageFill, pageRead, pageSubmit, pickCv } from '../src/core/page-commands';
import { fakeBackend, fixture, when } from './helpers';

const value = (v: string) => () => ({ action: 'set' as const, value: v, source: 'test' });
const instantly = async () => undefined;

const rules = [
  when(/full name/i, value('Jan Kowalski')),
  when(/^Email/, value('jan@example.com')),
  when(/^CV/, () => ({ action: 'upload-cv' as const })),
  when(/creating an account/i, () => ({ action: 'check' as const })),
  when(/consent/i, () => ({ action: 'check' as const })),
];

/** The offer page; the Apply button swallows its first `swallow` clicks, then opens the modal. */
function offerPage(swallow = 0, extraField = ''): { clicks: () => number } {
  document.body.innerHTML = fixture('justjoin-offer.html');
  let clicks = 0;
  document.getElementById('apply-sidebar')?.addEventListener('click', () => {
    clicks++;
    if (clicks > swallow) {
      document.body.insertAdjacentHTML(
        'beforeend',
        fixture('justjoin-modal.html').replace('<button', `${extraField}<button`),
      );
    }
  });
  return { clicks: () => clicks };
}

/** Pressing the modal's button replaces it with the site's confirmation. Call once the modal exists. */
function confirmOnSubmit(): void {
  document.getElementById('apply-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    document.getElementById('apply-form')?.replaceWith(
      Object.assign(document.createElement('div'), {
        textContent: 'Done! Your application has been sent to Acme',
      }),
    );
  });
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('openForm', () => {
  it('presses Apply once when the form shows, and ignores look-alike links', async () => {
    const page = offerPage();
    const out = await openForm({ adapter: justjoin, doc: document, sleep: instantly });
    expect(out).toEqual({ open: true });
    expect(page.clicks()).toBe(1);
  });

  it('presses again only after the first click was swallowed', async () => {
    const page = offerPage(1);
    const out = await openForm({ adapter: justjoin, doc: document, sleep: instantly });
    expect(out).toEqual({ open: true });
    expect(page.clicks()).toBe(2);
  });

  it('stops at one click when the click opened another tab (an external ATS)', async () => {
    const page = offerPage(99);
    const out = await openForm({
      adapter: justjoin,
      doc: document,
      sleep: instantly,
      spawned: async () => (page.clicks() > 0 ? 'https://acme.bamboohr.com/careers/1' : null),
    });
    expect(out).toEqual({ open: false, external: 'https://acme.bamboohr.com/careers/1' });
    expect(page.clicks()).toBe(1);
  });

  it('gives up without a button instead of looping', async () => {
    document.body.innerHTML = '<p>offer expired</p>';
    expect(await openForm({ adapter: justjoin, doc: document, sleep: instantly })).toEqual({
      open: false,
    });
  });
});

describe('pickCv', () => {
  const cvs = [
    { id: 'SAVED/Acme_123-Dev', label: 'Acme_123-Dev' },
    { id: 'SAVED/Beta_456-Dev', label: 'Beta_456-Dev' },
  ];
  it('matches by vacancy id, by exact id, and refuses ambiguity or a miss', () => {
    expect(pickCv(cvs, '456', '', 'x.com')).toEqual({ id: 'SAVED/Beta_456-Dev' });
    expect(pickCv(cvs, 'SAVED/Acme_123-Dev', '', 'x.com')).toEqual({ id: 'SAVED/Acme_123-Dev' });
    expect(pickCv(cvs, 'Dev', '', 'x.com')).toHaveProperty('error');
    expect(pickCv(cvs, '999', '', 'x.com')).toHaveProperty('error');
  });
  it('without a spec falls back to the company in the page title, else nothing', () => {
    expect(pickCv(cvs, undefined, 'Dev at Acme', 'justjoin.it')).toEqual({
      id: 'SAVED/Acme_123-Dev',
    });
    expect(pickCv(cvs, undefined, 'Dev', 'justjoin.it')).toEqual({ id: null });
  });
});

describe('pageFill', () => {
  it('opens the form, fills it, ticks only the mandatory consent and hands back a token', async () => {
    offerPage();
    const backend = fakeBackend(rules);
    const out = await pageFill(
      { adapter: justjoin, backend, doc: document, sleep: instantly },
      { openForm: true },
    );
    expect(out.formOpen).toBe(true);
    expect(out.filled).toBeGreaterThan(0);
    expect(out.token).toBeTruthy();
    expect((document.querySelector('[name=name]') as HTMLInputElement).value).toBe('Jan Kowalski');
    expect(
      (document.querySelector('[name=create_account_accepted]') as HTMLInputElement).checked,
    ).toBe(false);
    expect((document.querySelector('[name=consent]') as HTMLInputElement).checked).toBe(true);
  });

  it('says so, and hands back no token, when there is no form to fill', async () => {
    document.body.innerHTML = '<p>offer expired</p>';
    const out = await pageFill(
      { adapter: justjoin, backend: fakeBackend(rules), doc: document, sleep: instantly },
      { openForm: true },
    );
    expect(out).toMatchObject({ formOpen: false, filled: 0 });
    expect(out.token).toBeUndefined();
  });

  it('does not open the form when told to fill what is there', async () => {
    const page = offerPage();
    const out = await pageFill(
      { adapter: justjoin, backend: fakeBackend(rules), doc: document, sleep: instantly },
      { openForm: false },
    );
    expect(out.formOpen).toBe(false);
    expect(page.clicks()).toBe(0);
  });
});

describe('pageRead', () => {
  it('reports what the page shows now', async () => {
    offerPage();
    const deps = {
      adapter: justjoin,
      backend: fakeBackend(rules),
      doc: document,
      sleep: instantly,
    };
    await pageFill(deps, { openForm: true });
    const form = await pageRead(deps);
    expect(form.find((f) => /name/i.test(f.label))?.value).toBe('Jan Kowalski');
    expect(form.find((f) => /consent/i.test(f.label))?.value).not.toBe('');
  });
});

describe('pageSubmit', () => {
  async function filled() {
    offerPage();
    const deps = {
      adapter: justjoin,
      backend: fakeBackend(rules),
      doc: document,
      sleep: instantly,
    };
    const { token } = await pageFill(deps, { openForm: true });
    confirmOnSubmit();
    return { deps, token: token ?? '' };
  }

  it('presses the form’s own button and recognises the site’s confirmation', async () => {
    const { deps, token } = await filled();
    expect(await pageSubmit(deps, token)).toEqual({ submitted: true, signal: 'success-text' });
  });

  it('refuses a stale or foreign token, and a second press on the same fill', async () => {
    const { deps, token } = await filled();
    await expect(pageSubmit(deps, 'nope')).rejects.toThrow(/fill/i);
    await pageSubmit(deps, token);
    await expect(pageSubmit(deps, token)).rejects.toThrow(/fill/i);
  });

  it('refuses an invalid form (an unticked mandatory consent)', async () => {
    const { deps, token } = await filled();
    (document.querySelector('[name=consent]') as HTMLInputElement).checked = false;
    await expect(pageSubmit(deps, token)).rejects.toThrow(/not valid/i);
    expect(document.getElementById('apply-form')).not.toBeNull();
  });

  it('refuses a quote under the floor', async () => {
    offerPage(0, '<label for="s">Expected salary</label><input id="s" name="salary" />');
    const deps = {
      adapter: justjoin,
      backend: fakeBackend([
        ...rules,
        when(/salary/i, () => ({ action: 'manual' as const, reason: 'below-floor' as const })),
      ]),
      doc: document,
      sleep: instantly,
    };
    const { token } = await pageFill(deps, { openForm: true });
    await expect(pageSubmit(deps, token ?? '')).rejects.toThrow(/floor/i);
  });

  it('reports "none" when the click changes nothing, instead of claiming success', async () => {
    offerPage();
    const deps = {
      adapter: justjoin,
      backend: fakeBackend(rules),
      doc: document,
      sleep: instantly,
    };
    const { token } = await pageFill(deps, { openForm: true });
    document.getElementById('apply-form')?.addEventListener('submit', (e) => e.preventDefault());
    expect(await pageSubmit(deps, token ?? '')).toMatchObject({ submitted: false, signal: 'none' });
  });
});
