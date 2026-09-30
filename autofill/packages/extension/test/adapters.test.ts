import { beforeEach, describe, expect, it } from 'vitest';
import { pickAdapter } from '../src/adapters';
import { erecruiter } from '../src/adapters/erecruiter';
import { justjoin } from '../src/adapters/justjoin';
import { nofluffjobs } from '../src/adapters/nofluffjobs';
import { traffit } from '../src/adapters/traffit';
import { fillForm } from '../src/core/run';
import { fakeBackend, fixture, installFakeBridge, when } from './helpers';

const value = (v: string) => () => ({ action: 'set' as const, value: v, source: 'test' });
const nothing = async () => undefined;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pickAdapter', () => {
  it.each([
    ['https://acme.traffit.com/public/form/a/abc', 'traffit'],
    ['https://acme.traffit.com/public/an/abc', null],
    ['https://form.erecruiter.pl/form/9f2c', 'erecruiter'],
    ['https://system.erecruiter.pl/FormTemplates/RecruitmentForm.aspx?WebID=x', 'erecruiter'],
    ['https://skk.erecruiter.pl/Offer.aspx?oid=1', null],
    ['https://justjoin.it/job-offer/acme-dev', 'justjoin'],
    ['https://justjoin.it/', null],
    ['https://nofluffjobs.com/pl/job/dev-acme-warszawa', 'nofluffjobs'],
    ['https://example.com/', null],
  ])('%s -> %s', (url, id) => {
    expect(pickAdapter(new URL(url))?.id ?? null).toBe(id);
  });
});

describe('traffit', () => {
  it('fills text, drives the selectize through the bridge, ticks only the mandatory consent, attaches the CV', async () => {
    document.body.innerHTML = fixture('traffit.html');
    installFakeBridge({
      'dynamic_form[properties][7][5]': [
        { id: 'a1', label: 'Od zaraz' },
        { id: 'a2', label: '2 tygodnie' },
      ],
    });
    const backend = fakeBackend([
      when(/^Imię/, value('Jan')),
      when(/^Nazwisko/, value('Kowalski')),
      when(/^E-mail/, value('jan@example.com')),
      when(/^CV/, () => ({ action: 'upload-cv' })),
      when(/^Dostępność/, value('Od zaraz')),
      when(/future/i, () => ({ action: 'leave' })),
      when(/consent/i, () => ({ action: 'check' })),
    ]);

    const report = await fillForm({ adapter: traffit, backend, doc: document, cvId: 'SAVED/x' });

    expect((document.getElementById('f1') as HTMLInputElement).value).toBe('Jan');
    expect((document.getElementById('f3') as HTMLInputElement).value).toBe('jan@example.com');
    expect((document.getElementById('f5') as HTMLSelectElement).dataset['chosen']).toBe('a1');
    const [consent, future] = document.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(consent?.checked).toBe(true);
    expect(future?.checked).toBe(false);
    expect((document.getElementById('f4') as HTMLInputElement).files?.length).toBe(1);
    expect(report.cv).toBe('uploaded');
    expect(report.manual).toEqual([]);
    // the selectize's own text shell is never sent to the planner
    expect(backend.asked.some((f) => f.key.endsWith('-selectized'))).toBe(false);
  });

  it('reports a combobox answer it cannot map instead of forcing an option', async () => {
    document.body.innerHTML = fixture('traffit.html');
    installFakeBridge({ 'dynamic_form[properties][7][5]': [{ id: 'a1', label: 'Od zaraz' }] });
    const backend = fakeBackend([when(/^Dostępność/, value('Immediately'))]);
    const report = await fillForm({ adapter: traffit, backend, doc: document, cvId: null });
    expect(report.manual.map((m) => m.label)).toContain('Dostępność *');
    expect((document.getElementById('f5') as HTMLSelectElement).dataset['chosen']).toBeUndefined();
  });
});

describe('erecruiter (legacy WebForms)', () => {
  it('never touches honeypots or the referral e-mail, and refills after the CV postback', async () => {
    document.body.innerHTML = fixture('erecruiter-legacy.html');
    const waits: number[] = [];
    const country = document.getElementById('a4') as HTMLSelectElement;
    const backend = fakeBackend([
      when(/^First name/, value('Jan')),
      when(/^E-mail/, value('jan@example.com')),
      when(/^Country/, value('Poland')),
      when(/^CV/, () => ({ action: 'upload-cv' })),
    ]);

    // the postback: after the upload the site resets the select
    const realCv = backend.cv;
    backend.cv = async (id) => {
      setTimeout(() => (country.value = ''), 0);
      return realCv(id);
    };

    const report = await fillForm({
      adapter: erecruiter,
      backend,
      doc: document,
      cvId: 'SAVED/x',
      sleep: async (ms) => {
        waits.push(ms);
        await new Promise((r) => setTimeout(r, 5));
      },
    });

    expect(backend.asked.some((f) => /fakeuser|tbText/.test(f.key))).toBe(false);
    expect((document.querySelector('[name$="ctl61$tbText"]') as HTMLInputElement).value).toBe('');
    expect(waits).toEqual([2500]);
    expect(country.value).toBe('PL');
    expect(report.cv).toBe('uploaded');
  });
});

describe('justjoin', () => {
  it('stays inside the modal and never ticks the account / terms box', async () => {
    document.body.innerHTML = fixture('justjoin.html');
    const backend = fakeBackend([
      when(/^Name/, value('Jan Kowalski')),
      when(/^Email/, value('jan@example.com')),
      when(/creating an account/i, () => ({ action: 'check' })),
      when(/consent/i, () => ({ action: 'check' })),
    ]);
    await fillForm({ adapter: justjoin, backend, doc: document, cvId: null });

    expect((document.querySelector('[name=name]') as HTMLInputElement).value).toBe('Jan Kowalski');
    expect(backend.asked.some((f) => f.key === 'q')).toBe(false);
    expect((document.querySelector('[name=account]') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('[name=consent]') as HTMLInputElement).checked).toBe(true);
  });
});

describe('nofluffjobs', () => {
  it('labels the anonymous inputs by position and leaves every checkbox alone', async () => {
    document.body.innerHTML = fixture('nofluffjobs.html');
    const backend = fakeBackend([
      when(/full name/i, value('Jan Kowalski')),
      when(/^E-mail/i, value('jan@example.com')),
      when(/^Phone/i, value('+48 111 222 333')),
      when(/future/i, () => ({ action: 'check' })),
    ]);
    await fillForm({ adapter: nofluffjobs, backend, doc: document, cvId: null });

    const [name, email, phone] = [
      ...document.querySelectorAll<HTMLInputElement>('[role=dialog] input'),
    ];
    expect([name?.value, email?.value, phone?.value]).toEqual([
      'Jan Kowalski',
      'jan@example.com',
      '+48 111 222 333',
    ]);
    expect((document.querySelector('input[type=checkbox]') as HTMLInputElement).checked).toBe(
      false,
    );
    expect(backend.asked.some((f) => f.key === 'site-search')).toBe(false);
  });
});

void nothing;
