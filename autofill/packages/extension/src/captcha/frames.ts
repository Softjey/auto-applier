import type { CaptchaIframeReply, CaptchaKind, CaptchaWidgetReply, Rect } from '@applier/protocol';
import { deepAll } from '../core/deep';
import { isVisible } from '../core/visibility';

/**
 * Which captcha frame a URL is. A widget is two frames: the small one with the checkbox
 * ("anchor") and a big one that holds the picture / audio challenge, hidden until it is needed.
 */
export type FrameRole =
  { kind: CaptchaKind; part: 'checkbox' | 'challenge'; invisible: boolean } | { kind: 'turnstile' };

const RECAPTCHA_HOSTS = new Set([
  'www.google.com',
  'google.com',
  'www.recaptcha.net',
  'recaptcha.net',
]);

export function frameRole(raw: string): FrameRole | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // reCAPTCHA v3 and invisible v2 draw an anchor too (the corner badge): nothing to tick there.
  const invisible = /(?:^|[?&#])size=invisible\b/.test(`${url.search}${url.hash}`);
  if (RECAPTCHA_HOSTS.has(url.hostname)) {
    const m = /^\/recaptcha\/(?:api2|enterprise)\/(anchor|bframe)\b/.exec(url.pathname);
    if (!m) return null;
    return { kind: 'recaptcha', part: m[1] === 'anchor' ? 'checkbox' : 'challenge', invisible };
  }
  if (url.hostname === 'hcaptcha.com' || url.hostname.endsWith('.hcaptcha.com')) {
    // hCaptcha names the frame in the fragment: #frame=checkbox&id=… / #frame=challenge&id=…
    const frame = /(?:^|[?&#])frame=(checkbox|challenge)\b/.exec(`${url.search}${url.hash}`)?.[1];
    if (!frame) return null;
    return { kind: 'hcaptcha', part: frame === 'checkbox' ? 'checkbox' : 'challenge', invisible };
  }
  if (url.hostname === 'challenges.cloudflare.com') return { kind: 'turnstile' };
  return null;
}

// ── In a page: the content script's answers ────────────────────────────────────────────────────

const toRect = (r: { x: number; y: number; width: number; height: number }): Rect => ({
  x: r.x,
  y: r.y,
  width: r.width,
  height: r.height,
});

const sameResource = (a: string, b: string): boolean => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    return x.origin === y.origin && x.pathname === y.pathname;
  } catch {
    return false;
  }
};

/**
 * The <iframe> in `doc` that hosts `childUrl`. The browser reports a frame by its URL, the page
 * holds an element with a `src`: same string first, then same origin + path (a widget rewrites
 * its query once it loads), then — only when there is no doubt — the one same-origin iframe.
 */
export function findChildIframe(doc: Document, childUrl: string): HTMLIFrameElement | null {
  const frames = deepAll<HTMLIFrameElement>(doc, 'iframe, frame');
  const exact = frames.find((f) => f.src === childUrl);
  if (exact) return exact;
  const same = frames.filter((f) => sameResource(f.src, childUrl));
  if (same.length === 1 && same[0]) return same[0];
  if (same.length > 1) {
    // Two widgets from one host: hCaptcha tells them apart by the id in the fragment.
    const id = /[#&?]id=([^&]+)/.exec(childUrl)?.[1];
    const byId = id ? same.find((f) => f.src.includes(`id=${id}`)) : undefined;
    return byId ?? null;
  }
  let origin = '';
  try {
    origin = new URL(childUrl).origin;
  } catch {
    return null;
  }
  const sameOrigin = frames.filter((f) => f.src.startsWith(origin));
  return sameOrigin.length === 1 && sameOrigin[0] ? sameOrigin[0] : null;
}

/** Where `childUrl`'s iframe sits in this frame's viewport — its content box, border excluded. */
export function iframeReply(doc: Document, childUrl: string): CaptchaIframeReply {
  const view = doc.defaultView;
  const viewport = { width: view?.innerWidth ?? 0, height: view?.innerHeight ?? 0 };
  const el = findChildIframe(doc, childUrl);
  if (!el) return { rect: null, visible: false, viewport };
  const r = el.getBoundingClientRect();
  const style = view?.getComputedStyle(el);
  const padLeft = parseFloat(style?.paddingLeft ?? '0') || 0;
  const padTop = parseFloat(style?.paddingTop ?? '0') || 0;
  const rect = toRect({
    x: r.x + el.clientLeft + padLeft,
    y: r.y + el.clientTop + padTop,
    width: el.clientWidth || r.width,
    height: el.clientHeight || r.height,
  });
  // reCAPTCHA hides its challenge frame with visibility:hidden *and* a -10000px top.
  const visible = isVisible(el) && r.width > 30 && r.height > 30 && r.bottom > -1000;
  return { rect, visible, viewport };
}

/** This frame is a checkbox widget: the box, and whether it is ticked. */
export function widgetReply(doc: Document, role: FrameRole | null): CaptchaWidgetReply {
  if (!role || role.kind === 'turnstile') return { box: null, checked: false };
  const el =
    role.kind === 'recaptcha'
      ? doc.querySelector<HTMLElement>('#recaptcha-anchor')
      : doc.querySelector<HTMLElement>('#checkbox');
  if (!el) return { box: null, checked: false };
  const checked = el.getAttribute('aria-checked') === 'true';
  const r = el.getBoundingClientRect();
  return { box: r.width > 0 && r.height > 0 ? toRect(r) : null, checked };
}
