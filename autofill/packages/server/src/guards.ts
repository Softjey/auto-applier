import type { MiddlewareHandler } from 'hono';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

/**
 * The server hands out personal data, so it answers exactly one kind of
 * client: the extension's service worker.
 *  - Host must be loopback: defeats DNS rebinding (attacker.example resolving
 *    to 127.0.0.1 still sends Host: attacker.example).
 *  - Origin must be a chrome-extension:// origin: a web page's own fetch
 *    carries its page origin and is refused, and a no-cors request carries no
 *    Origin at all, so it is refused too.
 *
 * Every data route is therefore a POST: Chrome sends `Origin` on the
 * extension's POSTs but omits it on its GETs (found in the e2e run), so a GET
 * cannot be told apart from a no-cors page request.
 */
export const loopbackExtensionOnly: MiddlewareHandler = async (c, next) => {
  // c.req.url is built from the Host header, so this is the Host the client sent.
  const host = new URL(c.req.url).hostname;
  if (!LOOPBACK_HOSTS.has(host)) return c.json({ error: 'bad host' }, 403);

  const origin = c.req.header('origin') ?? '';
  if (!EXTENSION_ORIGIN.test(origin)) return c.json({ error: 'extension only' }, 403);

  c.header('access-control-allow-origin', origin);
  c.header('access-control-allow-headers', 'content-type');
  c.header('vary', 'origin');
  if (c.req.method === 'OPTIONS') return c.body(null, 204);
  await next();
};

/**
 * Passwords get a stricter door than profile facts: any installed extension can send
 * "Origin: chrome-extension://<its own id>", so the credential routes accept only OUR
 * extension's pinned id (protocol EXTENSION_ID, or $AUTOFILL_EXTENSION_ID for a store build).
 */
export const pinnedExtensionOnly =
  (extensionId: string): MiddlewareHandler =>
  async (c, next) => {
    if (c.req.header('origin') !== `chrome-extension://${extensionId}`) {
      return c.json({ error: 'not the Applier extension' }, 403);
    }
    await next();
  };
