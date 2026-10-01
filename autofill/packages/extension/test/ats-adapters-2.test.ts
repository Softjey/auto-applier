import { beforeEach, describe, expect, it } from 'vitest';
import { pickAdapter } from '../src/adapters';
import { bamboohr } from '../src/adapters/bamboohr';
import { comeet } from '../src/adapters/comeet';
import { smartrecruiters } from '../src/adapters/smartrecruiters';
import { solidjobs } from '../src/adapters/solidjobs';
import { fillForm } from '../src/core/run';
import { fakeBackend, mountFakeCombobox, when } from './helpers';

const value = (v: string) => () => ({ action: 'set' as const, value: v, source: 'test' });
const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pickAdapter — Comeet, BambooHR, SmartRecruiters, solid.jobs', () => {
  it.each([
    ['https://www.comeet.co/jobs/acme/AB.123/senior-dev/apply', 'comeet'],
    ['https://www.comeet.com/jobs/acme/AB.123', null],
    ['https://acme.bamboohr.com/careers/42', 'bamboohr'],
    ['https://acme.bamboohr.com/careers', null],
    [
      'https://jobs.smartrecruiters.com/oneclick-ui/company/Acme/publication/abc',
      'smartrecruiters',
    ],
    ['https://jobs.smartrecruiters.com/oneclick-ui/company/Acme/publication/abc/success', null],
    ['https://jobs.smartrecruiters.com/Acme/743999-dev', null],
    ['https://solid.jobs/apply/123/senior-dev', 'solidjobs'],
    ['https://solid.jobs/offer/123/senior-dev', null],
  ])('%s -> %s', (url, id) => {
    expect(pickAdapter(new URL(url), document)?.id ?? null).toBe(id);
  });
});

describe('comeet', () => {
  it('fills the short-keyed fields and a screening radio named by its question', async () => {
    document.body.innerHTML = `<form>
      <label for="a">First name</label><input id="a" name="firstName" />
      <label for="b">Email</label><input id="b" name="email" type="email" />
      <label for="c">CV</label><input id="c" type="file" name="cv" />
      <fieldset><legend>Is this a B2B contract position?</legend>
        <label><input type="radio" name="This role is B2B" value="yes" /> Yes</label>
        <label><input type="radio" name="This role is B2B" value="no" /> No</label></fieldset></form>`;
    const backend = fakeBackend([
      when(/^First name/, value('Jan')),
      when(/^Email/, value('jan@example.com')),
      when(/^CV/, () => ({ action: 'upload-cv' })),
      when(/B2B/, value('Yes')),
    ]);
    const report = await fillForm({ adapter: comeet, backend, doc: document, cvId: 'SAVED/x' });
    expect($<HTMLInputElement>('#a').value).toBe('Jan');
    expect($<HTMLInputElement>('[value=yes]').checked).toBe(true);
    expect(report.cv).toBe('uploaded');
  });
});

describe('bamboohr', () => {
  it('never writes to the nickname_ honeypot, whatever its suffix', async () => {
    document.body.innerHTML = `<form>
      <label for="f">First Name *</label><input id="f" name="firstName" />
      <label for="h">Please leave this field blank</label><input id="h" name="nickname_hpxyz" />
    </form>`;
    const backend = fakeBackend([
      when(/^First Name/, value('Jan')),
      when(/leave this field/, value('oops')),
    ]);
    await fillForm({ adapter: bamboohr, backend, doc: document, cvId: null });
    expect($<HTMLInputElement>('#f').value).toBe('Jan');
    expect($<HTMLInputElement>('#h').value).toBe('');
    expect(backend.asked.some((f) => /nickname_/.test(f.key))).toBe(false);
  });
});

describe('smartrecruiters (open shadow DOM, CV first)', () => {
  const build = () => {
    const host = document.createElement('spl-form');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <label for="first-name-input">First name *</label><input id="first-name-input" />
      <label for="email-input">Email *</label><input id="email-input" type="email" />
      <spl-dropzone><input id="file-input" type="file" /></spl-dropzone>
      <label for="hiring-manager-message-input">Message</label>
      <textarea id="hiring-manager-message-input"></textarea>`;
    document.body.append(host);
    return shadow;
  };

  it('reaches fields inside the shadow root and uploads the CV BEFORE filling', async () => {
    const shadow = build();
    const order: string[] = [];
    const backend = fakeBackend([
      when(/^First name/, value('Jan')),
      when(/^Email/, value('jan@example.com')),
      when(/Message/, value('should stay empty')),
    ]);
    // the plan has no label for the file input, so name it by id
    const plan = backend.plan;
    backend.plan = async (fields, band) => {
      const res = await plan(fields, band);
      res.plan = res.plan.map((p) =>
        fields.find((f) => f.id === p.id)?.kind === 'file' ? { id: p.id, action: 'upload-cv' } : p,
      );
      return res;
    };
    const cv = backend.cv;
    backend.cv = async (id) => {
      order.push(`cv:${$<HTMLInputElement>('#first-name-input', shadow).value || 'empty'}`);
      // what the site's parser does after an upload: junk over the first name
      setTimeout(() => ($<HTMLInputElement>('#first-name-input', shadow).value = 'Frontend'), 0);
      return cv(id);
    };

    const report = await fillForm({
      adapter: smartrecruiters,
      backend,
      doc: document,
      cvId: 'SAVED/x',
      sleep: (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 10))),
    });

    expect(order).toEqual(['cv:empty']); // uploaded while the form was still empty
    expect($<HTMLInputElement>('#email-input', shadow).value).toBe('jan@example.com');
    expect($<HTMLInputElement>('#file-input', shadow).files?.length).toBe(1);
    expect($<HTMLTextAreaElement>('#hiring-manager-message-input', shadow).value).toBe('');
    expect(report.cv).toBe('uploaded');
  });
});

describe('solid.jobs (Angular Material)', () => {
  it('drives a mat-select by opening its overlay, and ticks only the mandatory consents', async () => {
    document.body.innerHTML = `<form>
      <label for="mat-input-0">Imię</label><input id="mat-input-0" />
      <label id="lbl">Forma zatrudnienia</label>
      <mat-select id="mat-select-0" role="combobox" aria-labelledby="lbl">
        <span class="mat-mdc-select-placeholder">Wybierz</span></mat-select>
      <label><input type="checkbox" required /> [obowiązkowe] Akceptuję regulamin</label>
      <label><input type="checkbox" /> Zgoda na przyszłe rekrutacje</label></form>`;
    mountFakeCombobox($('#mat-select-0'), { rows: ['B2B', 'UoP'] });
    const sel = $('#mat-select-0');

    const backend = fakeBackend([
      when(/^Imię/, value('Jan')),
      when(/zatrudnienia/, value('B2B')),
      when(/regulamin/, () => ({ action: 'check' })),
      when(/przysz/, () => ({ action: 'check' })),
    ]);
    const report = await fillForm({ adapter: solidjobs, backend, doc: document, cvId: null });

    expect($<HTMLInputElement>('#mat-input-0').value).toBe('Jan');
    expect(sel.textContent).toBe('B2B');
    const [terms, future] = document.querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    expect(terms?.checked).toBe(true);
    expect(future?.checked).toBe(false);
    expect(report.outcomes.find((o) => /zatrudnienia/.test(o.label))?.status).toBe('filled');
  });
});
