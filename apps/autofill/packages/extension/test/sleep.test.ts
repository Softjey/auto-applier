import { afterEach, describe, expect, it, vi } from 'vitest';
import { sleep } from '../src/core/sleep';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sleep', () => {
  it('waits on a timer in a visible tab', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    await sleep(10);
    expect(spy).toHaveBeenCalled();
  });

  it('waits on the clock, never on a timer, in a hidden tab (whose timers are throttled)', async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    const spy = vi.spyOn(globalThis, 'setTimeout');
    const t0 = performance.now();
    await sleep(60);
    expect(performance.now() - t0).toBeGreaterThanOrEqual(55);
    expect(spy).not.toHaveBeenCalled();
  });
});
