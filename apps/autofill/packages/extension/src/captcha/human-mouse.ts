import type { Rect } from '@applier/protocol';

/**
 * How a hand moves a mouse, as numbers: a curved path (not a straight line), fast in the middle
 * and slow at both ends (minimum-jerk), a duration that grows with distance and shrinks with the
 * target's size (Fitts), a little tremor, now and then a small overshoot and a correction, and a
 * press that lands near — not exactly on — the centre. Pure: the randomness comes in as `rng`, so
 * a test can pin it.
 */

export interface Point {
  x: number;
  y: number;
}
/** One mouse event: where, and how long to wait before sending it. */
export interface Step extends Point {
  delayMs: number;
}
export type Rng = () => number;

const between = (rng: Rng, lo: number, hi: number): number => lo + (hi - lo) * rng();

/** Standard normal, Box–Muller. */
function gauss(rng: Rng): number {
  const u = Math.max(rng(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** A small seeded generator (mulberry32) for tests and reproducible runs. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Where in the box a person presses: around the centre, spread over about a sixth of its size,
 * never in the outer fifth (a press on the very edge can miss the control).
 */
export function pressPoint(box: Rect, rng: Rng): Point {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  return {
    x: clamp(cx + gauss(rng) * (box.width / 6), box.x + box.width * 0.2, box.x + box.width * 0.8),
    y: clamp(
      cy + gauss(rng) * (box.height / 6),
      box.y + box.height * 0.2,
      box.y + box.height * 0.8,
    ),
  };
}

/** Fitts: ~250 ms for a twitch, a little more for every doubling of distance / size. */
export function movementMs(distance: number, targetSize: number, rng: Rng): number {
  const fitts = 230 + 130 * Math.log2(distance / Math.max(targetSize, 1) + 1);
  return Math.round(fitts * between(rng, 0.85, 1.25));
}

const minimumJerk = (t: number): number => t * t * t * (10 - 15 * t + 6 * t * t);

function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** One stroke from `from` to `to`, sampled at ~60 Hz like a real mouse. */
function stroke(from: Point, to: Point, durationMs: number, rng: Rng): Step[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return [{ ...to, delayMs: Math.round(between(rng, 12, 20)) }];
  // the unit normal: control points are pushed sideways off the straight line → an arc
  const nx = -dy / dist;
  const ny = dx / dist;
  const bend = (lo: number, hi: number) => between(rng, -1, 1) * dist * between(rng, lo, hi);
  const k1 = between(rng, 0.2, 0.4);
  const k2 = between(rng, 0.6, 0.8);
  const s1 = bend(0.05, 0.25);
  const s2 = bend(0.02, 0.15);
  const c1 = { x: from.x + dx * k1 + nx * s1, y: from.y + dy * k1 + ny * s1 };
  const c2 = { x: from.x + dx * k2 + nx * s2, y: from.y + dy * k2 + ny * s2 };

  const n = Math.max(8, Math.round(durationMs / 16));
  const out: Step[] = [];
  for (let i = 1; i <= n; i++) {
    const p = bezier(from, c1, c2, to, minimumJerk(i / n));
    // tremor, fading to nothing on arrival
    const shake = i === n ? 0 : 0.6 * (1 - i / n);
    out.push({
      x: Math.round((p.x + gauss(rng) * shake) * 100) / 100,
      y: Math.round((p.y + gauss(rng) * shake) * 100) / 100,
      delayMs: Math.max(4, Math.round(durationMs / n + gauss(rng) * 3)),
    });
  }
  const last = out[out.length - 1];
  if (last) {
    last.x = to.x;
    last.y = to.y;
  }
  return out;
}

/**
 * The whole approach to a target box of size `targetSize`: one stroke, or — on a long way, about
 * one time in four — a stroke that lands a few px past the target and a short correction back.
 */
export function humanPath(from: Point, to: Point, targetSize: number, rng: Rng): Step[] {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const total = movementMs(dist, targetSize, rng);
  if (dist > 200 && rng() < 0.25) {
    const ux = (to.x - from.x) / dist;
    const uy = (to.y - from.y) / dist;
    const past = between(rng, 4, 10);
    const off = between(rng, -3, 3);
    const over = { x: to.x + ux * past - uy * off, y: to.y + uy * past + ux * off };
    return [
      ...stroke(from, over, total, rng),
      ...stroke(over, to, Math.round(between(rng, 120, 220)), rng),
    ];
  }
  return stroke(from, to, total, rng);
}

/** Wheel notches to scroll by `deltaY` px: ~100 px each, as a mouse wheel sends them. */
export function wheelSteps(deltaY: number, rng: Rng): { deltaY: number; delayMs: number }[] {
  const out: { deltaY: number; delayMs: number }[] = [];
  let left = deltaY;
  while (Math.abs(left) > 1) {
    const notch = Math.sign(left) * Math.min(Math.abs(left), Math.round(between(rng, 90, 120)));
    out.push({ deltaY: notch, delayMs: Math.round(between(rng, 35, 95)) });
    left -= notch;
  }
  return out;
}

/** Pauses around the press itself: settle on the target, hold the button. */
export const pressTiming = (rng: Rng): { settleMs: number; holdMs: number } => ({
  settleMs: Math.round(between(rng, 90, 240)),
  holdMs: Math.round(between(rng, 65, 140)),
});
