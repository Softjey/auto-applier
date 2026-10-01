import { createRoot, type Root } from 'react-dom/client';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { chromeBackend, chromeCreds } from '../src/core/messaging';
import { PasswordController } from '../src/passwords/controller';
import { PasswordsPanel } from '../src/ui/PasswordsPanel';
import '../src/ui/passwords.css';

/**
 * The password manager runs on every https page (and loopback http, for the local test
 * fixtures), not just the supported ATSes: an employer's sign-in lives wherever the
 * employer put it. It does nothing, and mounts nothing, on a page with no account form.
 */
export default defineContentScript({
  matches: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  allFrames: true,
  runAt: 'document_end',
  cssInjectionMode: 'ui',
  async main(ctx) {
    const controller = new PasswordController({
      doc: document,
      creds: chromeCreds,
      backend: chromeBackend,
      topFrame: window === window.top,
    });

    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let mounting = false;
    const ensureUi = async () => {
      if (ui || mounting) return;
      const s = controller.getState();
      if (!s.form && !s.prompt && !s.notice) return;
      mounting = true;
      ui = await createShadowRootUi(ctx, {
        name: 'applier-passwords',
        position: 'overlay',
        anchor: 'html',
        append: 'last',
        onMount: (container) => {
          const root = createRoot(container);
          root.render(<PasswordsPanel controller={controller} />);
          return root;
        },
        onRemove: (root) => root?.unmount(),
      });
      ui.mount();
    };
    controller.subscribe(() => void ensureUi());

    await controller.start();
    await ensureUi();

    // Sign-in forms are routinely drawn late (SPAs, modals, a second step): follow the DOM.
    // A throttle, not a debounce: a page that mutates all the time (an SPA that never settles)
    // would keep resetting a debounce and the form would never be looked at (found on Atlassian).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        void controller.refresh();
      }, 400);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'style', 'class', 'aria-hidden'],
    });
    ctx.onInvalidated(() => {
      observer.disconnect();
      controller.stop();
    });
    ctx.addEventListener(window, 'wxt:locationchange', schedule);
  },
});
