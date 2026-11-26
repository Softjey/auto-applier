import { createRoot, type Root } from 'react-dom/client';
import {
  createShadowRootUi,
  type ShadowRootContentScriptUi,
} from 'wxt/utils/content-script-ui/shadow-root';
import { PageCommand, type BackgroundResult } from '@applier/protocol';
import { MATCH_PATTERNS, pickAdapter, type SiteAdapter } from '../src/adapters';
import { chromeBackend, chromeSpawned } from '../src/core/messaging';
import { pageFill, pageRead, pageSubmit } from '../src/core/page-commands';
import { sleep } from '../src/core/sleep';
import { Panel } from '../src/ui/Panel';
import '../src/ui/panel.css';

const MAX_RESTORES = 10;
const RESTORE_DEBOUNCE_MS = 300;

export default defineContentScript({
  matches: MATCH_PATTERNS,
  // DOMContentLoaded, not "idle": slow third-party widgets (reCAPTCHA, maps) can hold the
  // load event for a minute, and the panel should not wait for them.
  runAt: 'document_end',
  cssInjectionMode: 'ui',
  async main(ctx) {
    let ui: ShadowRootContentScriptUi<Root> | null = null;
    let mounted: SiteAdapter | null = null;

    // justjoin.it is a SPA: the page a form lives on is reached
    // without a load, so the panel follows the location, not the document. The
    // Navigation API fires BEFORE `location.href` changes, so the destination
    // comes from the event, never from `location`.
    const sync = async (url: URL) => {
      const adapter = pickAdapter(url, document);
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

    // A page that hydrates after we mounted (Greenhouse: React error #418, "hydration failed")
    // replaces the whole <html> element and drops what it did not render, our panel included.
    // The observer therefore watches the document, not <html>. Put the panel back.
    let restores = 0;
    let pending: number | undefined;
    new MutationObserver(() => {
      if (!ui || ui.shadowHost.isConnected || restores >= MAX_RESTORES) return;
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        if (!ui || ui.shadowHost.isConnected) return;
        restores++;
        ui.remove();
        ui.mount();
      }, RESTORE_DEBOUNCE_MS);
    }).observe(document, { childList: true, subtree: true });

    // The agent's commands (autofill_open_and_fill & co.) arrive here from the background worker.
    // Only the worker can send them: a web page has no way to message an extension's scripts.
    const waitForLoad = async () => {
      for (let i = 0; i < 80 && document.readyState !== 'complete'; i++) await sleep(250);
      await sleep(400); // let a hydrating app settle
    };
    const answer = async (cmd: PageCommand): Promise<unknown> => {
      if (cmd.type === 'page-ping') {
        await waitForLoad();
        return { adapter: pickAdapter(new URL(location.href), document)?.id ?? null };
      }
      const adapter = pickAdapter(new URL(location.href), document);
      if (!adapter) throw new Error('No Applier adapter for this page.');
      const deps = { adapter, backend: chromeBackend, doc: document, spawned: chromeSpawned };
      switch (cmd.type) {
        case 'page-fill':
          await waitForLoad();
          return pageFill(deps, { cv: cmd.cv, band: cmd.band, openForm: cmd.openForm });
        case 'page-read':
          return pageRead(deps);
        case 'page-submit':
          return pageSubmit(deps, cmd.token);
      }
    };
    browser.runtime.onMessage.addListener((raw: unknown) => {
      const cmd = PageCommand.safeParse(raw);
      if (!cmd.success) return undefined; // not ours: leave it to the other content scripts
      return answer(cmd.data).then(
        (data): BackgroundResult<unknown> => ({ ok: true, data }),
        (e: unknown): BackgroundResult<unknown> => ({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    });

    await sync(new URL(location.href));
    ctx.addEventListener(window, 'wxt:locationchange', ({ newUrl }) => void sync(newUrl));
  },
});
