import { beforeEach, describe, expect, it } from 'vitest';
import { erecruiter } from '../src/adapters/erecruiter';
import { fillForm } from '../src/core/run';
import { fakeBackend, when } from './helpers';

const value = (v: string) => () => ({ action: 'set' as const, value: v, source: 'test' });

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('multiple choice: Radix checkbox clusters and <select multiple>', () => {
  const radixBoxes = () => {
    document.body.innerHTML = `<form>
      <div class="q"><label>Preferowany rodzaj umowy:*</label>
        <div><div><button type="button" role="checkbox" aria-checked="false" id="uop"></button><label for="uop">Umowa o Pracę</label></div>
        <div><button type="button" role="checkbox" aria-checked="false" id="b2b"></button><label for="b2b">B2B</label></div></div>
      </div>
      <div class="q"><button type="button" role="checkbox" aria-checked="false" aria-required="true" id="consent"></button>
        <label for="consent">Wyrażam zgodę na przetwarzanie moich danych osobowych w celu rekrutacji</label></div></form>`;
    document
      .querySelectorAll<HTMLElement>('[role=checkbox]')
      .forEach((b) =>
        b.addEventListener('click', () =>
          b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')),
        ),
      );
  };
  const state = (id: string) => document.getElementById(id)?.getAttribute('aria-checked');

  it('reads sibling checkboxes as one question and ticks only the named option', async () => {
    radixBoxes();
    const backend = fakeBackend([when(/rodzaj umowy/i, value('B2B'))]);
    await fillForm({ adapter: erecruiter, backend, doc: document, cvId: null });
    const q = backend.asked.find((f) => /rodzaj umowy/.test(f.label));
    expect(q?.options?.map((o) => o.label)).toEqual(['Umowa o Pracę', 'B2B']);
    expect(state('b2b')).toBe('true');
    expect(state('uop')).toBe('false');
    expect(state('consent')).toBe('false');
  });

  it('ticks several named options and reports the one it cannot match', async () => {
    radixBoxes();
    const backend = fakeBackend([when(/rodzaj umowy/i, value('B2B, Umowa o Pracę, Freelance'))]);
    const report = await fillForm({ adapter: erecruiter, backend, doc: document, cvId: null });
    expect(state('b2b')).toBe('true');
    expect(state('uop')).toBe('true');
    expect(report.manual.find((m) => /rodzaj umowy/.test(m.label))?.hint).toBe('Freelance');
  });

  it('takes a sentence answer as one choice, not as a list', async () => {
    radixBoxes();
    const sentence =
      'B2B — the compensation anchor is 150 PLN/h net on a B2B invoice; open to UoP if B2B is unavailable.';
    const backend = fakeBackend([when(/rodzaj umowy/i, value(sentence))]);
    const report = await fillForm({ adapter: erecruiter, backend, doc: document, cvId: null });
    expect(state('b2b')).toBe('true');
    expect(state('uop')).toBe('false');
    expect(report.manual.map((m) => m.label).join()).not.toMatch(/rodzaj umowy/);
  });

  it('selects the named options of a <select multiple> and keeps existing ones', async () => {
    document.body.innerHTML = `<form><div class="form-group"><label for="t">Which technologies? Select all that apply.</label>
      <select id="t" name="t" multiple><option value="r">React</option><option value="n">Next.js</option><option value="g">Git</option><option value="x">Terraform</option></select></div></form>`;
    const git = document.querySelector<HTMLOptionElement>('option[value=g]');
    if (git) git.selected = true;
    const backend = fakeBackend([when(/technologies/i, value('React, Next.js'))]);
    await fillForm({ adapter: erecruiter, backend, doc: document, cvId: null });
    const chosen = [...(document.getElementById('t') as HTMLSelectElement).selectedOptions].map(
      (o) => o.value,
    );
    expect(chosen.sort()).toEqual(['g', 'n', 'r']);
  });
});
