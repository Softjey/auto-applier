import { CaptchaFrameRequest } from '@applier/protocol';
import { frameRole, iframeReply, widgetReply } from '../src/captcha/frames';

/**
 * Eyes for the captcha clicker (src/captcha/solve.ts). Runs in every frame — the page, an
 * embedded ATS form, and the captcha widget's own frames (google.com / recaptcha.net /
 * hcaptcha.com are https too) — and only answers the worker's questions about its own frame.
 * It never clicks: the click is a real mouse event the worker sends through the debugger.
 */
export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  allFrames: true,
  runAt: 'document_end',
  main() {
    browser.runtime.onMessage.addListener((raw: unknown) => {
      const req = CaptchaFrameRequest.safeParse(raw);
      if (!req.success) return undefined; // not ours
      const reply =
        req.data.type === 'captcha-iframe'
          ? iframeReply(document, req.data.childUrl)
          : widgetReply(document, frameRole(location.href));
      return Promise.resolve(reply);
    });
  },
});
