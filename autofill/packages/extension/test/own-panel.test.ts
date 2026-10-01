import { beforeEach, describe, expect, it } from 'vitest';
import { deepAll } from '../src/core/deep';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('deepAll', () => {
  it("walks into a page's open shadow roots but not into this extension's own panels", () => {
    document.body.innerHTML =
      '<form><input name="page"></form><x-widget></x-widget><applier-autofill></applier-autofill>';
    document
      .querySelector('x-widget')
      ?.attachShadow({ mode: 'open' })
      .append(document.createElement('input'));
    const panel = document.querySelector('applier-autofill')?.attachShadow({ mode: 'open' });
    const own = document.createElement('select');
    panel?.append(own);

    const found = deepAll(document, 'input, select');
    expect(found.length).toBe(2); // the form's input and the widget's, not the panel's <select>
    expect(found).not.toContain(own);
  });
});
