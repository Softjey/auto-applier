import { MATCH_PATTERNS } from '../src/adapters';

// Runs in the PAGE's own JS world. Selectize hangs its API off the native
// <select> as `el.selectize`, an expando the isolated content-script world
// cannot see (ats/traffit.com.md). This answers the requests made by
// src/core/selectize.ts; only JSON strings cross the boundary.
interface SelectizeApi {
  options: Record<
    string,
    { id: string | number; title?: string; locality?: string; text?: string }
  >;
  setValue(id: string | number, silent: boolean): void;
}
type WithSelectize = HTMLElement & { selectize?: SelectizeApi };

interface Req {
  id: string;
  op: 'options' | 'set';
  target: string;
  optionId?: string;
}

export default defineContentScript({
  matches: MATCH_PATTERNS,
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const answer = (id: string, payload: unknown) =>
      document.dispatchEvent(new CustomEvent(`af-res-${id}`, { detail: JSON.stringify(payload) }));
    // Most options have `title`; the location ones have `locality` and no title.
    const label = (o: SelectizeApi['options'][string]) => o.title ?? o.locality ?? o.text ?? '';

    document.addEventListener('af-req', (e) => {
      let req: Req;
      try {
        req = JSON.parse((e as CustomEvent<string>).detail) as Req;
      } catch {
        return;
      }
      const api = (document.querySelector(`[data-af-id="${req.target}"]`) as WithSelectize | null)
        ?.selectize;
      if (!api) return answer(req.id, { ok: false });

      if (req.op === 'options') {
        return answer(req.id, {
          ok: true,
          options: Object.values(api.options).map((o) => ({ id: String(o.id), label: label(o) })),
        });
      }
      const hit = Object.values(api.options).find((o) => String(o.id) === req.optionId);
      if (!hit) return answer(req.id, { ok: false });
      api.setValue(hit.id, false);
      answer(req.id, { ok: true });
    });
  },
});
