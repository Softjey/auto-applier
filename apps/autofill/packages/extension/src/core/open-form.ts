import type { SiteAdapter } from '../adapters';
import { sleep as defaultSleep } from './sleep';

const POLL_MS = 250;
/** A single-page app can take a while to paint the Apply button after the HTML arrives. */
const BUTTON_WAIT_MS = 8_000;
/** After a click: how long the form gets to show before we decide the click was swallowed. */
const FORM_WAIT_MS = 2_000;
const MAX_CLICKS = 3;

export type OpenResult = { open: true } | { open: false; external?: string };

export interface OpenOptions {
  adapter: SiteAdapter;
  doc: Document;
  /** Did the last click open a new tab (an external ATS)? Its URL when so. */
  spawned?: () => Promise<string | null>;
  sleep?: (ms: number) => Promise<void>;
}

/** Is the application form on screen? An adapter without a `scope` has the whole page as its form. */
export const formIsOpen = (adapter: SiteAdapter, doc: Document): boolean =>
  adapter.scope ? adapter.scope(doc) !== null : true;

/**
 * Press the offer page's Apply button until the form shows. justjoin.it swallows the first click
 * after a load fairly often and can open-then-close on two quick ones, so: click, WAIT, and click
 * again only when nothing happened — and never when the click opened another tab, which would
 * multiply external application pages.
 */
export async function openForm({
  adapter,
  doc,
  spawned,
  sleep = defaultSleep,
}: OpenOptions): Promise<OpenResult> {
  if (formIsOpen(adapter, doc)) return { open: true };
  if (!adapter.opener) return { open: false };

  for (let click = 0; click < MAX_CLICKS; click++) {
    let button = adapter.opener(doc);
    for (let waited = 0; !button && waited < BUTTON_WAIT_MS; waited += POLL_MS) {
      await sleep(POLL_MS);
      if (formIsOpen(adapter, doc)) return { open: true };
      button = adapter.opener(doc);
    }
    if (!button) return { open: false };

    button.click();
    for (let waited = 0; waited < FORM_WAIT_MS; waited += POLL_MS) {
      await sleep(POLL_MS);
      if (formIsOpen(adapter, doc)) return { open: true };
      const external = await spawned?.();
      if (external) return { open: false, external };
    }
  }
  return { open: false };
}
