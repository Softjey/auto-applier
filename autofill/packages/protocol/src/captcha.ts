import { z } from 'zod';

/**
 * Background worker -> one frame's captcha content script (`tabs.sendMessage` with a `frameId`).
 * The worker walks the frame tree itself (webNavigation) and asks each frame only about itself:
 * - `captcha-iframe`: where, in this frame's viewport, is the <iframe> that hosts `childUrl`?
 * - `captcha-widget`: this frame IS a checkbox widget — where is the box, is it ticked?
 */
export const CaptchaFrameRequest = z.discriminatedUnion('type', [
  z.object({ type: z.literal('captcha-iframe'), childUrl: z.string() }),
  z.object({ type: z.literal('captcha-widget') }),
]);
export type CaptchaFrameRequest = z.infer<typeof CaptchaFrameRequest>;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptchaIframeReply {
  /** The child's content box in this frame's viewport (CSS px); null when no <iframe> matched. */
  rect: Rect | null;
  /** Would a person see it: not display:none / visibility:hidden, has a size. */
  visible: boolean;
  viewport: { width: number; height: number };
  /** `document.hidden` of this frame: a hidden page (minimized / covered window) takes no input. */
  hidden: boolean;
}

export interface CaptchaWidgetReply {
  /** The checkbox in this frame's viewport; null when the widget has not drawn it (yet). */
  box: Rect | null;
  checked: boolean;
}

export type CaptchaKind = 'recaptcha' | 'hcaptcha';

/**
 * What `captcha` did. Only `challenge` and `failed` need the person:
 * - `none`: no checkbox to tick (no captcha, or an invisible / score-based one — v3, Turnstile);
 * - `already-solved`: the box was ticked before we came;
 * - `solved`: we ticked it and the widget accepted it;
 * - `challenge`: the widget wants pictures / audio — level 1 stops here, nothing is clicked in it;
 * - `failed`: something technical (no debugger, the box never answered).
 */
export interface CaptchaResult {
  status: 'none' | 'already-solved' | 'solved' | 'challenge' | 'failed';
  kind?: CaptchaKind;
  note?: string;
}
