import { beforeEach, describe, expect, it } from 'vitest';
import { pickAdapter } from '../src/adapters';
import { ashby } from '../src/adapters/ashby';
import { greenhouse } from '../src/adapters/greenhouse';
import { lever } from '../src/adapters/lever';
import { teamtailor } from '../src/adapters/teamtailor';
import { fillForm } from '../src/core/run';
import { fakeBackend, fixture, mountFakeCombobox, when } from './helpers';

const value = (v: string) => () => ({ action: 'set' as const, value: v, source: 'test' });
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('pickAdapter — the new ATSes', () => {
  it.each([
    ['https://jobs.ashbyhq.com/acme/1234/application', 'ashby'],
    ['https://jobs.ashbyhq.com/acme/1234', null],
    ['https://job-boards.greenhouse.io/acme/jobs/4359670004', 'greenhouse'],
    ['https://job-boards.eu.greenhouse.io/acme/jobs/1', 'greenhouse'],
    ['https://job-boards.greenhouse.io/embed/job_app?for=acme&token=1', 'greenhouse'],
    ['https://job-boards.greenhouse.io/acme/jobs/1/confirmation', null],
    ['https://job-boards.greenhouse.io/acme', null],
    ['https://jobs.lever.co/acme/7f3ce4d8-6db9/apply', 'lever'],
    ['https://jobs.lever.co/acme/7f3ce4d8-6db9', null],
    ['https://acme.teamtailor.com/jobs/123-senior-dev', 'teamtailor'],
    ['https://career.example.com/jobs/123-senior-dev', null], // no Teamtailor assets to prove it
  ])('%s -> %s', (url, id) => {
    expect(pickAdapter(new URL(url), document)?.id ?? null).toBe(id);
  });

  it('recognises Teamtailor on a customer domain from the page itself', () => {
    document.body.innerHTML = fixture('teamtailor.html');
    const url = new URL('https://dnatechnology.work/jobs/8394625-senior-engineer');
    expect(pickAdapter(url, document)?.id).toBe('teamtailor');
    expect(pickAdapter(new URL('https://dnatechnology.work/about'), document)).toBeNull();
  });
});

describe('greenhouse (react-select dropdowns)', () => {
  const setup = () => {
    document.body.innerHTML = fixture('greenhouse.html');
    mountFakeCombobox($('#question_1'), { rows: ['Yes', 'No'] });
    mountFakeCombobox($('#question_2'), { rows: ['LinkedIn', 'Referral', 'Other'] });
    mountFakeCombobox($('#candidate-location'), {
      rows: (typed) =>
        /^warsaw/i.test(typed)
          ? ['Warsaw, Indiana, United States', 'Warsaw, Mazowieckie, Poland']
          : [],
    });
  };
  const picked = (id: string) =>
    document.getElementById(id)?.closest('.select')?.querySelector('.select__single-value')
      ?.textContent;

  it('fills text, picks dropdown rows by opening them, resolves a location, never joins a talent pool', async () => {
    setup();
    const backend = fakeBackend([
      when(/^First Name/, value('Jan')),
      when(/^Last Name/, value('Kowalski')),
      when(/^Email/, value('jan@example.com')),
      when(/^Resume/, () => ({ action: 'upload-cv' })),
      when(/legally authorized/, value('Yes')),
      when(/hear about/, value('LinkedIn')),
      when(/^Location/, value('Warsaw, Poland')),
      when(/talent pool/, () => ({ action: 'check' })),
    ]);

    const report = await fillForm({ adapter: greenhouse, backend, doc: document, cvId: 'SAVED/x' });

    expect($<HTMLInputElement>('#first_name').value).toBe('Jan');
    expect($<HTMLInputElement>('#email').value).toBe('jan@example.com');
    expect(picked('question_1')).toBe('Yes');
    expect(picked('question_2')).toBe('LinkedIn');
    expect(picked('candidate-location')).toBe('Warsaw, Mazowieckie, Poland');
    expect($<HTMLInputElement>('[name=talent]').checked).toBe(false);
    expect($<HTMLInputElement>('#resume').files?.length).toBe(1);
    expect(report.cv).toBe('uploaded');
    // react-select's invisible `required` twin is not a field
    expect(backend.asked.filter((f) => f.label === '')).toEqual([]);
    // the dropdown's rows reached the planner, read by opening the list
    expect(backend.asked.find((f) => f.id && /authorized/.test(f.label))?.options).toEqual([
      { value: 'Yes', label: 'Yes' },
      { value: 'No', label: 'No' },
    ]);
  });

  it("resolves the profile's own location wording, with a parenthetical and a full stop", async () => {
    setup();
    const backend = fakeBackend([when(/^Location/, value('Warsaw, Poland (mazowieckie).'))]);
    await fillForm({ adapter: greenhouse, backend, doc: document, cvId: null });
    expect(picked('candidate-location')).toBe('Warsaw, Mazowieckie, Poland');
  });

  it("does not need the parenthetical region to match the site's name for it", async () => {
    setup();
    // the profile says "mazowieckie"; another site would list "Masovian Voivodeship"
    const backend = fakeBackend([when(/^Location/, value('Warsaw, Poland (zzz-no-such-region).'))]);
    await fillForm({ adapter: greenhouse, backend, doc: document, cvId: null });
    expect(picked('candidate-location')).toBe('Warsaw, Mazowieckie, Poland');
  });

  it('refuses an ambiguous location instead of guessing, and clears what it typed', async () => {
    setup();
    const backend = fakeBackend([when(/^Location/, value('Warsaw'))]);
    const report = await fillForm({ adapter: greenhouse, backend, doc: document, cvId: null });
    expect(report.manual.map((m) => m.label)).toContain('Location (City)*');
    expect(picked('candidate-location')).toBeUndefined();
    expect($<HTMLInputElement>('#candidate-location').value).toBe('');
  });

  it('leaves a dropdown that already holds an answer alone', async () => {
    setup();
    mountFakeCombobox($('#question_1'), { rows: ['Yes', 'No'] });
    const control = $('#question_1').closest('.select__control')!;
    control.insertAdjacentHTML('afterbegin', '<div class="select__single-value">No</div>');
    const report = await fillForm({
      adapter: greenhouse,
      backend: fakeBackend([when(/legally authorized/, value('Yes'))]),
      doc: document,
      cvId: null,
    });
    expect(control.querySelector('.select__single-value')?.textContent).toBe('No');
    expect(report.outcomes.find((o) => /authorized/.test(o.label))?.status).toBe('left');
  });

  it('falls back to the keyboard when a list ignores mouse clicks', async () => {
    document.body.innerHTML = fixture('greenhouse.html');
    mountFakeCombobox($('#question_1'), { rows: ['Yes', 'No'], keyboardOnly: true });
    await fillForm({
      adapter: greenhouse,
      backend: fakeBackend([when(/legally authorized/, value('No'))]),
      doc: document,
      cvId: null,
    });
    expect(picked('question_1')).toBe('No');
  });
});

describe('ashby (Yes/No segmented buttons, no <form>)', () => {
  const wire = () => {
    // what React does: the clicked button of a pair takes `_active_`
    for (const button of document.querySelectorAll('button')) {
      button.addEventListener('click', () => {
        for (const sibling of button.parentElement!.querySelectorAll('button'))
          sibling.className = sibling.className.replace(/ _active_x1/g, '');
        button.className += ' _active_x1';
      });
    }
  };

  it('answers Yes/No by clicking, takes the hidden checkbox out of the plan, refuses the AI acknowledgement', async () => {
    document.body.innerHTML = fixture('ashby.html');
    wire();
    const backend = fakeBackend([
      when(/^Full name/, value('Jan Kowalski')),
      when(/^Email/, value('jan@example.com')),
      when(/based in Poland/, value('Yes')),
      when(/talent pool/, value('No')),
      when(/generic\s+AI/i, () => ({ action: 'check' })),
    ]);

    const report = await fillForm({ adapter: ashby, backend, doc: document, cvId: null });

    expect($<HTMLInputElement>('#_systemfield_name').value).toBe('Jan Kowalski');
    const [yes1, no1, yes2, no2] = [...document.querySelectorAll('button')];
    expect(yes1?.className).toMatch(/_active_/);
    expect(no1?.className).not.toMatch(/_active_/);
    expect(yes2?.className).not.toMatch(/_active_/);
    expect(no2?.className).toMatch(/_active_/);
    expect($<HTMLInputElement>('[name=ack]').checked).toBe(false);
    // the Yes/No pair is one question, not a question plus a stray checkbox
    expect(backend.asked.filter((f) => /based in Poland/.test(f.label))).toHaveLength(1);
    expect(backend.asked.some((f) => f.key === 'q_based')).toBe(false);
    expect(report.outcomes.find((o) => /generic/i.test(o.label))?.status).toBe('left');
  });

  it('does not re-click a button that is already active', async () => {
    document.body.innerHTML = fixture('ashby.html');
    wire();
    const [yes, no] = document.querySelectorAll('button');
    no!.className += ' _active_x1';
    await fillForm({
      adapter: ashby,
      backend: fakeBackend([when(/based in Poland/, value('Yes'))]),
      doc: document,
      cvId: null,
    });
    expect(no!.className).toMatch(/_active_/);
    expect(yes!.className).not.toMatch(/_active_/);
  });
});

describe('lever', () => {
  it('reads each question from its own label (not the option texts), fills, attaches the CV', async () => {
    document.body.innerHTML = fixture('lever.html');
    const backend = fakeBackend([
      when(/^Full name/, value('Jan Kowalski')),
      when(/^Email/, value('jan@example.com')),
      when(/^Resume/, () => ({ action: 'upload-cv' })),
      when(/^Notice period/, value('2 weeks')),
    ]);
    const report = await fillForm({ adapter: lever, backend, doc: document, cvId: 'SAVED/x' });

    expect($<HTMLInputElement>('[name=name]').value).toBe('Jan Kowalski');
    expect($<HTMLSelectElement>('select').value).toBe('2 weeks');
    expect(report.cv).toBe('uploaded');
    const labels = backend.asked.map((f) => f.label);
    expect(labels).toContain('Notice period *');
    expect(labels).toContain('Current company');
    expect(backend.asked.find((f) => /Notice/.test(f.label))?.required).toBe(true);
    expect(backend.asked.find((f) => f.label === 'Current company')?.required).toBe(false);
  });
});

describe('teamtailor', () => {
  it('fills the candidate fields, ticks the mandatory consent through its real box, hands the slider back', async () => {
    document.body.innerHTML = fixture('teamtailor.html');
    const backend = fakeBackend([
      when(/^First name/, value('Jan')),
      when(/^Last name/, value('Kowalski')),
      when(/^Email/, value('jan@example.com')),
      when(/^Resume/, () => ({ action: 'upload-cv' })),
      when(/privacy/i, () => ({ action: 'check' })),
    ]);
    const report = await fillForm({ adapter: teamtailor, backend, doc: document, cvId: 'SAVED/x' });

    expect($<HTMLInputElement>('#fn').value).toBe('Jan');
    expect($<HTMLInputElement>('input[type=checkbox]').checked).toBe(true);
    expect(report.manual.map((m) => m.label)).toEqual(['How many years with Node?']);
    expect(report.cv).toBe('uploaded');
  });

  it('reports an empty form while the application modal has not mounted yet', async () => {
    document.body.innerHTML = '<p>Apply now</p>';
    const report = await fillForm({
      adapter: teamtailor,
      backend: fakeBackend([]),
      doc: document,
      cvId: null,
    });
    expect(report.outcomes).toEqual([]);
  });
});
