import { beforeEach, describe, expect, it } from 'vitest';
import { traffit } from '../src/adapters/traffit';
import { fillForm } from '../src/core/run';
import { fakeBackend, installFakeBridge, when } from './helpers';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('a selectize multi-select (Traffit)', () => {
  it('adds each named option through the bridge, not on the hidden <select>', async () => {
    document.body.innerHTML = `<form><div class="form-group"><label for="t">Type of contract *</label>
      <select id="t" name="contract" class="selectized" multiple></select></div></form>`;
    installFakeBridge({
      contract: [
        { id: '1', label: 'B2B' },
        { id: '2', label: 'umowa zlecenie' },
      ],
    });
    const answer = () => ({ action: 'set' as const, value: 'B2B, umowa zlecenie', source: 'test' });
    const report = await fillForm({
      adapter: traffit,
      backend: fakeBackend([when(/contract/i, answer)]),
      doc: document,
      cvId: null,
    });
    expect(document.getElementById('t')?.dataset['chosen']).toBe('1,2');
    expect(report.manual).toEqual([]);
  });

  it('keeps the question clean once the widget has drawn its list in the row', async () => {
    document.body.innerHTML = `<form><div class="form-group">Your availability *<div class="selectize-control"><div class="selectize-dropdown"><div class="option">2 weeks</div><div class="option">1 month</div></div></div>
      <select name="av" class="selectized"></select></div></form>`;
    installFakeBridge({ av: [{ id: 'a', label: '2 weeks' }] });
    const backend = fakeBackend([]);
    await fillForm({ adapter: traffit, backend, doc: document, cvId: null });
    expect(backend.asked.map((f) => f.label)).toEqual(['Your availability *']);
  });
});
