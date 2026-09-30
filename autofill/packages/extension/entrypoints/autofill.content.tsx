import { createRoot, type Root } from 'react-dom/client';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { MATCH_PATTERNS, pickAdapter } from '../src/adapters';
import { chromeBackend } from '../src/core/messaging';
import { Panel } from '../src/ui/Panel';
import '../src/ui/panel.css';

export default defineContentScript({
  matches: MATCH_PATTERNS,
  cssInjectionMode: 'ui',
  async main(ctx) {
    let ui: ShadowRootContentScriptUi<Root> | null = null;

    // justjoin.it and nofluffjobs are SPAs: the page a form lives on is reached
    // without a load, so the panel follows the location, not the document.
    const sync = async () => {
      const adapter = pickAdapter(new URL(location.href));
      if (!adapter) {
        ui?.remove();
        ui = null;
        return;
      }
      if (ui) return;
      ui = await createShadowRootUi(ctx, {
        name: 'applier-autofill',
        position: 'overlay',
        onMount: (container) => {
          const root = createRoot(container);
          root.render(<Panel adapter={adapter} backend={chromeBackend} />);
          return root;
        },
        onRemove: (root) => root?.unmount(),
      });
      ui.mount();
    };

    await sync();
    ctx.addEventListener(window, 'wxt:locationchange', () => void sync());
  },
});
