import { describe, expect, it } from 'vitest';
import { findChildIframe, frameRole, widgetReply } from '../src/captcha/frames';
import { humanPath, movementMs, pressPoint, seeded, wheelSteps } from '../src/captcha/human-mouse';

describe('frameRole', () => {
  it('tells the reCAPTCHA checkbox frame from its challenge frame', () => {
    expect(
      frameRole('https://www.google.com/recaptcha/api2/anchor?ar=1&k=KEY&co=x&hl=en&size=normal'),
    ).toEqual({ kind: 'recaptcha', part: 'checkbox', invisible: false });
    expect(frameRole('https://www.google.com/recaptcha/api2/bframe?hl=en&v=1&k=KEY')).toEqual({
      kind: 'recaptcha',
      part: 'challenge',
      invisible: false,
    });
    expect(frameRole('https://www.recaptcha.net/recaptcha/enterprise/anchor?k=KEY')).toMatchObject({
      kind: 'recaptcha',
      part: 'checkbox',
    });
  });

  it('marks the v3 / invisible badge, which has nothing to tick', () => {
    expect(frameRole('https://www.google.com/recaptcha/api2/anchor?k=KEY&size=invisible')).toEqual({
      kind: 'recaptcha',
      part: 'checkbox',
      invisible: true,
    });
  });

  it('reads hCaptcha frames from the fragment', () => {
    expect(
      frameRole(
        'https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html#frame=checkbox&id=0x1&host=x',
      ),
    ).toEqual({ kind: 'hcaptcha', part: 'checkbox', invisible: false });
    expect(
      frameRole(
        'https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html#frame=challenge&id=0x1',
      ),
    ).toMatchObject({ kind: 'hcaptcha', part: 'challenge' });
  });

  it('knows Turnstile and ignores everything else', () => {
    expect(frameRole('https://challenges.cloudflare.com/cdn-cgi/challenge-platform/x')).toEqual({
      kind: 'turnstile',
    });
    expect(frameRole('https://www.google.com/maps/embed?pb=1')).toBeNull();
    expect(frameRole('https://evil.example/recaptcha/api2/anchor')).toBeNull();
    expect(frameRole('about:blank')).toBeNull();
  });
});

describe('findChildIframe', () => {
  it('matches by src, then by origin + path when the query changed', () => {
    document.body.innerHTML = `
      <iframe id="a" src="https://www.google.com/recaptcha/api2/anchor?k=1&v=old"></iframe>
      <iframe id="b" src="https://example.com/other"></iframe>`;
    expect(
      findChildIframe(document, 'https://www.google.com/recaptcha/api2/anchor?k=1&v=old')?.id,
    ).toBe('a');
    expect(
      findChildIframe(document, 'https://www.google.com/recaptcha/api2/anchor?k=1&v=new')?.id,
    ).toBe('a');
  });

  it('tells two hCaptcha widgets apart by their id, and refuses to guess otherwise', () => {
    const base = 'https://newassets.hcaptcha.com/captcha/v1/x/static/hcaptcha.html';
    document.body.innerHTML = `
      <iframe id="one" src="${base}#frame=checkbox&id=0aa"></iframe>
      <iframe id="two" src="${base}#frame=checkbox&id=0bb"></iframe>`;
    expect(findChildIframe(document, `${base}#frame=checkbox&id=0bb`)?.id).toBe('two');
    expect(findChildIframe(document, `${base}#frame=checkbox&id=0cc`)).toBeNull();
  });
});

describe('widgetReply', () => {
  it('reads the tick from aria-checked', () => {
    document.body.innerHTML = `<span id="recaptcha-anchor" role="checkbox" aria-checked="true"></span>`;
    expect(
      widgetReply(document, frameRole('https://www.google.com/recaptcha/api2/anchor?k=1')),
    ).toMatchObject({ checked: true });
    document.body.innerHTML = `<div id="checkbox" role="checkbox" aria-checked="false"></div>`;
    expect(
      widgetReply(document, frameRole('https://a.hcaptcha.com/x.html#frame=checkbox&id=1')),
    ).toMatchObject({ checked: false });
  });
});

describe('human mouse', () => {
  const box = { x: 100, y: 400, width: 28, height: 28 };

  it('presses inside the inner part of the box, not always in the same spot', () => {
    const rng = seeded(7);
    const points = Array.from({ length: 200 }, () => pressPoint(box, rng));
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(box.x + box.width * 0.2);
      expect(p.x).toBeLessThanOrEqual(box.x + box.width * 0.8);
      expect(p.y).toBeGreaterThanOrEqual(box.y + box.height * 0.2);
      expect(p.y).toBeLessThanOrEqual(box.y + box.height * 0.8);
    }
    expect(new Set(points.map((p) => `${p.x},${p.y}`)).size).toBeGreaterThan(150);
  });

  it('takes longer for a longer way to a smaller target (Fitts)', () => {
    const avg = (d: number, w: number) => {
      const rng = seeded(1);
      let sum = 0;
      for (let i = 0; i < 100; i++) sum += movementMs(d, w, rng);
      return sum / 100;
    };
    expect(avg(800, 28)).toBeGreaterThan(avg(100, 28));
    expect(avg(400, 10)).toBeGreaterThan(avg(400, 60));
    expect(avg(800, 28)).toBeLessThan(1500);
  });

  it('ends exactly on the target along a curved, ~60 Hz path that is not a straight line', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const rng = seeded(seed);
      const from = { x: 600, y: 700 };
      const to = { x: 114, y: 414 };
      const path = humanPath(from, to, 28, rng);
      expect(path.at(-1)).toMatchObject(to);
      expect(path.length).toBeGreaterThanOrEqual(8);
      for (const s of path) {
        expect(s.delayMs).toBeGreaterThanOrEqual(4);
        expect(s.delayMs).toBeLessThan(60);
        // stays near the way there (an arc, an overshoot of a few px — never a wild detour)
        expect(s.x).toBeGreaterThan(Math.min(from.x, to.x) - 250);
        expect(s.x).toBeLessThan(Math.max(from.x, to.x) + 250);
      }
      const total = path.reduce((t, s) => t + s.delayMs, 0);
      expect(total).toBeGreaterThan(250);
      expect(total).toBeLessThan(2000);
    }
    // the middle of the path is off the straight line for most seeds
    let curved = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const path = humanPath({ x: 0, y: 0 }, { x: 600, y: 0 }, 28, seeded(seed));
      if (Math.abs(path[Math.floor(path.length / 2)]?.y ?? 0) > 3) curved++;
    }
    expect(curved).toBeGreaterThan(35);
  });

  it('is slow at the ends and fast in the middle', () => {
    const path = humanPath({ x: 0, y: 0 }, { x: 500, y: 0 }, 28, seeded(3));
    const speed = (i: number) => {
      const a = path[i - 1];
      const b = path[i];
      return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0;
    };
    const mid = Math.floor(path.length / 2);
    expect(speed(mid)).toBeGreaterThan(speed(1) * 2);
    expect(speed(mid)).toBeGreaterThan(speed(path.length - 1) * 2);
  });

  it('scrolls in wheel notches that add up to the distance', () => {
    const steps = wheelSteps(-437, seeded(5));
    expect(steps.reduce((t, s) => t + s.deltaY, 0)).toBe(-437);
    for (const s of steps) expect(Math.abs(s.deltaY)).toBeLessThanOrEqual(120);
    expect(wheelSteps(0, seeded(5))).toEqual([]);
  });
});
