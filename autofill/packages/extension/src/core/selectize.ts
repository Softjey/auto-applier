import type { FieldOption } from '@applier/protocol';

/**
 * Selectize (Traffit) keeps its API on `select.selectize`, an expando that
 * exists only in the page's own JS world. This talks to page-bridge.content.ts
 * (world: MAIN) over CustomEvents carrying JSON strings — nothing but
 * primitives crosses the world boundary.
 */
const ATTR = 'data-af-id';
const TIMEOUT_MS = 1500;

interface BridgeRequest {
  op: 'options' | 'set';
  target: string;
  optionId?: string;
}
type BridgeResult =
  { ok: false } | { ok: true; options?: { id: string; label: string }[]; shown?: string };

let seq = 0;

function request(
  el: HTMLElement,
  body: Omit<BridgeRequest, 'target'>,
  id: string,
): Promise<BridgeResult> {
  const doc = el.ownerDocument;
  el.setAttribute(ATTR, id);
  return new Promise((resolve) => {
    const reqId = `${id}-${++seq}`;
    const done = (result: BridgeResult) => {
      doc.removeEventListener(`af-res-${reqId}`, onResult);
      clearTimeout(timer);
      resolve(result);
    };
    const onResult = (e: Event) =>
      done(JSON.parse((e as CustomEvent<string>).detail) as BridgeResult);
    const timer = setTimeout(() => done({ ok: false }), TIMEOUT_MS);
    doc.addEventListener(`af-res-${reqId}`, onResult);
    const payload: BridgeRequest & { id: string } = { ...body, target: id, id: reqId };
    doc.dispatchEvent(new CustomEvent('af-req', { detail: JSON.stringify(payload) }));
  });
}

export async function selectizeOptions(el: HTMLElement, id: string): Promise<FieldOption[] | null> {
  const res = await request(el, { op: 'options' }, id);
  if (!res.ok || !res.options) return null;
  return res.options.map((o) => ({ value: o.id, label: o.label }));
}

export async function selectizeSet(
  el: HTMLElement,
  id: string,
  optionId: string,
): Promise<boolean> {
  return (await request(el, { op: 'set', optionId }, id)).ok;
}
