import { createRoot, type Root } from 'react-dom/client';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { MATCH_PATTERNS, pickAdapter, type SiteAdapter } from '../src/adapters';
import { chromeBackend } from '../src/core/messaging';
import { Panel } from '../src/ui/Panel';
import '../src/ui/panel.css';

export default defineContentScript({
  matches: MATCH_PATTERNS,
  // DOMContentLoaded, not "idle": slow third-party widgets (reCAPTCHA, maps) can hold the
  // load event for a minute, and the panel should not wait for them.
  runAt: 'document_end',
  cssInjectionMode: 'ui',
  async main(ctx) {
    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let mounted: SiteAdapter | null = null;

    // justjoin.it and nofluffjobs are SPAs: the page a form lives on is reached
    // without a load, so the panel follows the location, not the document. The
    // Navigation API fires BEFORE `location.href` changes, so the destination
    // comes from the event, never from `location`.
    const sync = async (url: URL) => {
      const adapter = pickAdapter(url);
      if (adapter === mounted) return;
      ui?.remove();
      ui = null;
      mounted = adapter;
      if (!adapter) return;
      ui = await createShadowRootUi(ctx, {
        name: 'applier-autofill',
        position: 'overlay',
        // Directly under <html>, not <body>: a modal library marks every other child of <body>
        // aria-hidden / inert while its dialog is open, which would make the panel unclickable
        // exactly when the application form is showing (justjoin.it).
        anchor: 'html',
        append: 'last',
        onMount: (container) => {
          const root = createRoot(container);
          root.render(<Panel adapter={adapter} backend={chromeBackend} />);
          return root;
        },
        onRemove: (root) => root?.unmount(),
      });
      ui.mount();
    };

    await sync(new URL(location.href));
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => void sync(newUrl));
  },
});
