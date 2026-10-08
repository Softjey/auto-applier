import type {
  CaptchaFrameRequest,
  CaptchaIframeReply,
  CaptchaKind,
  CaptchaResult,
  CaptchaWidgetReply,
  Rect,
} from '@applier/protocol';
import { frameRole } from './frames';
import {
  humanPath,
  pressPoint,
  pressTiming,
  wheelSteps,
  type Point,
  type Rng,
} from './human-mouse';

/**
 * Level 1 of captcha handling: tick a visible "I'm not a robot" box (reCAPTCHA v2, hCaptcha) the
 * way a person does, and stop the moment the widget asks for more.
 *
 * The click has to be a real one. A script's `el.click()` arrives with `isTrusted: false`, which is
 * exactly what these widgets look for, and a content script cannot reach into their frames anyway.
 * So the worker attaches the debugger for a moment and sends `Input.dispatchMouseEvent` — the same
 * channel DevTools uses — along a human path (human-mouse.ts), then lets go.
 *
 * Where things are: the browser lists the tab's frames (webNavigation); each frame's content
 * script (entrypoints/captcha.content.ts) says where its child iframe sits; summed up the chain
 * that puts the checkbox in the top viewport, through any number of nested frames.
 */

interface Frame {
  frameId: number;
  parentFrameId: number;
  url: string;
}

interface Widget {
  kind: CaptchaKind;
  /** The checkbox in top-viewport CSS px; null until the widget has drawn it. */
  box: Rect | null;
  checked: boolean;
}

interface Look {
  widgets: Widget[];
  /** A challenge (pictures, audio) is showing. */
  challenge: CaptchaKind | null;
  turnstile: boolean;
  viewport: { width: number; height: number };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Every browser call here gets a deadline. A frame that never answers (frozen, mid-navigation) or a
 * debugger that never attaches must end in `failed` with the step named — never in silence, which
 * the agent can only read as "the extension took the command but gave no result".
 */
class Stalled extends Error {}
function within<T>(work: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stall = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Stalled(`${what} did not answer in ${ms / 1000} s`)), ms);
  });
  return Promise.race([work, stall]).finally(() => clearTimeout(timer));
}
const FRAME_MS = 3_000;
/** Under the MCP tool's 45 s, so the agent always gets an answer. */
const OVERALL_MS = 38_000;

/** Where the mouse was left in each tab, so the next move starts from there, not from nowhere. */
const lastMouse = new Map<number, Point>();

async function listFrames(tabId: number): Promise<Frame[]> {
  const all =
    (await within(browser.webNavigation.getAllFrames({ tabId }), 5_000, 'The frame list')) ?? [];
  return all.map((f) => ({ frameId: f.frameId, parentFrameId: f.parentFrameId, url: f.url }));
}

async function ask<T>(tabId: number, frameId: number, msg: CaptchaFrameRequest): Promise<T | null> {
  try {
    const reply = browser.tabs.sendMessage(tabId, msg, { frameId }) as Promise<T | undefined>;
    return (await within(reply, FRAME_MS, `Frame ${frameId}`)) ?? null;
  } catch {
    return null; // the frame has no content script (yet), went away, or hangs
  }
}

/** A frame's viewport origin in the top viewport, and whether every iframe on the way shows. */
async function place(
  tabId: number,
  all: Frame[],
  frame: Frame,
): Promise<{ origin: Point; visible: boolean; viewport: Look['viewport'] } | null> {
  let x = 0;
  let y = 0;
  let visible = true;
  let viewport = { width: 0, height: 0 };
  for (let f = frame; f.parentFrameId !== -1;) {
    const parent = all.find((p) => p.frameId === f.parentFrameId);
    if (!parent) return null;
    const r = await ask<CaptchaIframeReply>(tabId, parent.frameId, {
      type: 'captcha-iframe',
      childUrl: f.url,
    });
    if (!r?.rect) return null;
    x += r.rect.x;
    y += r.rect.y;
    visible &&= r.visible;
    viewport = r.viewport; // the last one asked is the top frame's
    f = parent;
  }
  return { origin: { x, y }, visible, viewport };
}

async function look(tabId: number): Promise<Look> {
  const all = await listFrames(tabId);
  const out: Look = {
    widgets: [],
    challenge: null,
    turnstile: false,
    viewport: { width: 0, height: 0 },
  };
  for (const frame of all) {
    const role = frameRole(frame.url);
    if (!role) continue;
    if (role.kind === 'turnstile') {
      out.turnstile = true;
      continue;
    }
    const where = await place(tabId, all, frame);
    if (!where) continue;
    if (where.viewport.width) out.viewport = where.viewport;
    if (role.part === 'challenge') {
      if (where.visible) out.challenge = role.kind;
      continue;
    }
    if (role.invisible || !where.visible) continue;
    const w = await ask<CaptchaWidgetReply>(tabId, frame.frameId, { type: 'captcha-widget' });
    if (!w) continue;
    out.widgets.push({
      kind: role.kind,
      checked: w.checked,
      box: w.box
        ? {
            x: w.box.x + where.origin.x,
            y: w.box.y + where.origin.y,
            width: w.box.width,
            height: w.box.height,
          }
        : null,
    });
  }
  return out;
}

// ── The mouse ─────────────────────────────────────────────────────────────────────────────────

type Target = { tabId: number };

const send = (target: Target, method: string, params: Record<string, unknown>): Promise<unknown> =>
  within(browser.debugger.sendCommand(target, method, params), 3_000, method);

async function moveAlong(target: Target, from: Point, to: Point, size: number, rng: Rng) {
  for (const step of humanPath(from, to, size, rng)) {
    await sleep(step.delayMs);
    await send(target, 'Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: step.x,
      y: step.y,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
  }
  lastMouse.set(target.tabId, to);
}

async function wheel(target: Target, at: Point, deltaY: number, rng: Rng) {
  for (const notch of wheelSteps(deltaY, rng)) {
    await sleep(notch.delayMs);
    await send(target, 'Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: at.x,
      y: at.y,
      deltaX: 0,
      deltaY: notch.deltaY,
      pointerType: 'mouse',
    });
  }
}

async function press(target: Target, at: Point, rng: Rng) {
  const { settleMs, holdMs } = pressTiming(rng);
  await sleep(settleMs);
  const base = { x: at.x, y: at.y, button: 'left', clickCount: 1, pointerType: 'mouse' };
  await send(target, 'Input.dispatchMouseEvent', { type: 'mousePressed', buttons: 1, ...base });
  await sleep(holdMs);
  await send(target, 'Input.dispatchMouseEvent', { type: 'mouseReleased', buttons: 0, ...base });
}

const SCROLL_MARGIN = 90;
const ANSWER_MS = 10_000;

/** The first visible, unticked checkbox — measured again, since the page may have moved. */
const pending = (l: Look): Widget | undefined => l.widgets.find((w) => !w.checked && w.box);

export async function solveCaptcha(tabId: number, rng: Rng = Math.random): Promise<CaptchaResult> {
  try {
    return await within(attempt(tabId, rng), OVERALL_MS, 'The captcha step');
  } catch (e) {
    return { status: 'failed', note: e instanceof Error ? e.message : String(e) };
  }
}

async function attempt(tabId: number, rng: Rng): Promise<CaptchaResult> {
  let seen = await look(tabId);
  if (seen.challenge) {
    return { status: 'challenge', kind: seen.challenge, note: 'A challenge is already open.' };
  }
  const first = seen.widgets[0];
  if (!first) {
    return seen.turnstile
      ? { status: 'none', note: 'Cloudflare Turnstile: it decides by itself, nothing to tick.' }
      : { status: 'none' };
  }
  if (seen.widgets.every((w) => w.checked)) return { status: 'already-solved', kind: first.kind };
  const todo = pending(seen);
  if (!todo) return { status: 'failed', kind: first.kind, note: 'The checkbox is not drawn.' };

  const target = { tabId };
  try {
    await within(browser.debugger.attach(target, '1.3'), 5_000, 'The debugger');
  } catch (e) {
    return {
      status: 'failed',
      kind: todo.kind,
      note: `Could not attach the debugger: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  try {
    // A person looks at the tab they click in; the debugger's infobar may also shift the page.
    await browser.tabs.update(tabId, { active: true });
    await sleep(500);
    seen = await look(tabId);
    const vw = seen.viewport.width || 1200;
    const vh = seen.viewport.height || 800;
    const mouse = lastMouse.get(tabId) ?? {
      x: Math.round(vw * (0.35 + 0.3 * rng())),
      y: Math.round(vh * (0.55 + 0.25 * rng())),
    };

    // Off screen: roll the wheel like a person would, then measure again.
    for (let round = 0; round < 4; round++) {
      const w = pending(seen);
      if (!w?.box) break;
      const top = w.box.y;
      const bottom = w.box.y + w.box.height;
      if (top >= SCROLL_MARGIN && bottom <= vh - SCROLL_MARGIN) break;
      await wheel(target, mouse, Math.round(top + w.box.height / 2 - vh / 2), rng);
      await sleep(450);
      seen = await look(tabId);
    }

    const w = pending(seen);
    if (!w?.box) {
      return seen.widgets.some((x) => x.checked)
        ? { status: 'already-solved', kind: todo.kind }
        : { status: 'failed', kind: todo.kind, note: 'Lost the checkbox while scrolling.' };
    }
    const aim = pressPoint(w.box, rng);
    await moveAlong(target, mouse, aim, Math.min(w.box.width, w.box.height), rng);
    await press(target, aim, rng);
  } catch (e) {
    return {
      status: 'failed',
      kind: todo.kind,
      note: `The click did not go through: ${e instanceof Error ? e.message : String(e)}`,
    };
  } finally {
    await within(browser.debugger.detach(target), 3_000, 'Detach').catch(() => undefined);
  }

  // The widget answers on its own: a tick, or a challenge frame that becomes visible.
  const deadline = Date.now() + ANSWER_MS;
  while (Date.now() < deadline) {
    await sleep(300);
    const now = await look(tabId);
    if (now.challenge) {
      return {
        status: 'challenge',
        kind: now.challenge,
        note: 'Ticked; the widget asks for a picture/audio challenge. Left untouched.',
      };
    }
    if (now.widgets.length > 0 && now.widgets.every((x) => x.checked)) {
      return { status: 'solved', kind: todo.kind };
    }
  }
  return {
    status: 'failed',
    kind: todo.kind,
    note: 'Clicked; the box did not tick and no challenge opened.',
  };
}
