import { beforeEach, describe, expect, it } from 'vitest';
import { erecruiter } from '../src/adapters/erecruiter';
import { fillForm } from '../src/core/run';
import { fakeBackend, when } from './helpers';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('a language level typed into a box that lists the CEFR codes', () => {
  it('writes the code; a box that names no scale is handed back', async () => {
    document.body.innerHTML = `<form>
      <div class="form-group"><label for="p">What is your level of Polish? (Native, C2, C1, B2, B1, A2, A1)</label><input id="p" name="p"></div>
      <div class="form-group"><label for="e">English level</label><input id="e" name="e"></div></form>`;
    const level = () => ({ action: 'language-level' as const, cefr: 'C1' as const });
    const report = await fillForm({
      adapter: erecruiter,
      backend: fakeBackend([when(/Polish/, level), when(/English/, level)]),
      doc: document,
      cvId: null,
    });
    expect((document.getElementById('p') as HTMLInputElement).value).toBe('C1');
    expect((document.getElementById('e') as HTMLInputElement).value).toBe('');
    expect(report.manual.map((m) => m.label)).toEqual(['English level']);
  });
});

describe('optional boxes with nothing known for them', () => {
  it('leaves an optional text / url box empty instead of listing it, but a required one is listed', async () => {
    document.body.innerHTML = `<form>
      <div class="form-group"><label for="a">Other website</label><input id="a" name="a"></div>
      <div class="form-group"><label for="b">Anything else?</label><textarea id="b" name="b"></textarea></div>
      <div class="form-group"><label for="c">Mystery question *</label><input id="c" name="c"></div></form>`;
    const unknown = () => ({ action: 'manual' as const, reason: 'unknown' });
    const report = await fillForm({
      adapter: erecruiter,
      backend: fakeBackend([when(/./, unknown)]),
      doc: document,
      cvId: null,
    });
    expect(report.manual.map((m) => m.label)).toEqual(['Mystery question *']);
  });
});

describe('a masked phone box', () => {
  it('counts the number as kept when the mask only removed the spaces', async () => {
    document.body.innerHTML = `<form><div class="form-group"><label for="p">Phone *</label><input id="p" type="tel" name="phone"></div></form>`;
    const input = document.getElementById('p') as HTMLInputElement;
    // a mask: keeps digits and the plus, drops everything else
    input.addEventListener('input', () => {
      const cleaned = input.value.replace(/[^\d+]/g, '');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
        input,
        cleaned,
      );
    });
    const report = await fillForm({
      adapter: erecruiter,
      backend: fakeBackend([
        when(/Phone/, () => ({ action: 'set', value: '+48 000 000 000', source: 't' })),
      ]),
      doc: document,
      cvId: null,
    });
    expect(input.value).toBe('+48000000000');
    expect(report.outcomes.map((o) => o.status)).toEqual(['filled']);
  });
});

describe('optional free text', () => {
  const load = (star: string) => {
    document.body.innerHTML = `<form><div class="form-group"><label for="m">Wiadomość do Rekrutera/ki ${star}</label><textarea id="m" name="m"></textarea></div></form>`;
  };
  const narrative = when(/Wiadomość/, () => ({ action: 'manual' as const, reason: 'narrative' }));

  it('is left empty, not listed as a question for the user', async () => {
    load('');
    const report = await fillForm({
      adapter: erecruiter,
      backend: fakeBackend([narrative]),
      doc: document,
      cvId: null,
    });
    expect(report.manual).toEqual([]);
    expect((document.getElementById('m') as HTMLTextAreaElement).value).toBe('');
  });

  it('is handed to the user when the form requires it', async () => {
    load('*');
    const report = await fillForm({
      adapter: erecruiter,
      backend: fakeBackend([narrative]),
      doc: document,
      cvId: null,
    });
    expect(report.manual.map((m) => m.reason)).toEqual(['narrative']);
  });
});
