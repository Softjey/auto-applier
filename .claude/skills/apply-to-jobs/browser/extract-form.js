// Phase 2 field-schema extractor. Paste this whole file into whatever your
// runtime's run-JS-in-the-page capability is (see ./README.md), then save the
// returned JSON to runs/<run-id>/<Company>_<vacancyId>/form.json.
//
// It only READS. It never types, clicks or submits — Phase 2 must be able to
// run over every vacancy in the queue without touching a single employer.
//
// What it returns is a COMPACT DIGEST: one entry per real field, honeypots
// counted rather than listed, labels and option lists clipped. Because the
// run-JS capability truncates a long return value, the digest is PAGED — each
// chunk ends on a field boundary and reports `next`. Keep calling
//
//     window.__digest(next)
//
// until `next` is null; concatenate the `fields` arrays into form.json. Small
// forms come back in one call. Never re-run the whole script to see more, and
// never slice a stashed string by character offset — that guesswork cost an
// earlier run dozens of empty calls.
//
// The full uncut record stays on `window.__form`, for the rare field whose
// label or option list the digest clipped:
//
//     JSON.stringify(window.__form.fields.find(f => f.key === "..."))
//
// Custom comboboxes (selectize, Indeed's own widget) hide their options until
// clicked, so `options` is best-effort: a native <select> gives a real list, a
// custom one gives [] and an `optionsHidden: true` flag telling Phase 4 to
// click the control and read the popup instead.
(() => {
  const HONEYPOT_RE = /fakeuser|fakepass|honeypot|bot[-_]?trap|remembered/i;

  const labelFor = (el) => {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && l.innerText.trim()) return l.innerText.trim();
    }
    const wrap = el.closest("label");
    if (wrap && wrap.innerText.trim()) return wrap.innerText.trim();
    const fs = el.closest("fieldset");
    if (fs) {
      const lg = fs.querySelector("legend");
      if (lg && lg.innerText.trim()) return lg.innerText.trim();
    }
    const aria = el.getAttribute("aria-label");
    if (aria) return aria;
    if (el.getAttribute("aria-labelledby")) {
      const t = document.getElementById(el.getAttribute("aria-labelledby"));
      if (t && t.innerText.trim()) return t.innerText.trim();
    }
    // Last resort: nearest preceding text in the field's own row/cell.
    const row = el.closest("tr, .form-group, .field, mat-form-field, div");
    if (row) {
      const txt = (row.innerText || "").trim().split("\n")[0];
      if (txt) return txt;
    }
    return "";
  };

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
  const isRequired = (el) => {
    if (el.required || el.getAttribute("aria-required") === "true") return true;
    return /\*|obowi[aą]zkowe/i.test(labelFor(el));
  };

  const fields = [];
  const groups = new Map(); // radio/checkbox groups keyed by name
  let honeypots = 0;
  let broken = 0;

  document.querySelectorAll("input, select, textarea").forEach((el) => {
    // One hostile element must never cost the whole extraction.
    try {
      if (el.type === "hidden") return;
      const key = el.name || el.id || "";
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const visible = !!(rect.width && rect.height) && style.visibility !== "hidden";

      // Honeypots are the anti-autofill traps some ATSes (eRecruiter) put in
      // front of the real control. Writing into one silently loses the answer.
      if (HONEYPOT_RE.test(key) || (!visible && el.type !== "file" && !el.disabled)) {
        honeypots++;
        fields.push({ label: clean(labelFor(el)), key, kind: "honeypot", skip: true });
        return;
      }

      if (el.type === "radio" || el.type === "checkbox") {
        const g = groups.get(key) || {
          label: clean(labelFor(el)),
          key,
          kind: el.type === "radio" ? "radio-group" : "checkbox-group",
          required: false,
          options: [],
        };
        g.options.push({ value: el.value, label: clean(labelFor(el)) || el.value, checked: el.checked });
        if (isRequired(el)) g.required = true;
        // A fieldset legend is the real question; the per-input label is the option.
        const fs = el.closest("fieldset");
        if (fs) {
          const lg = fs.querySelector("legend");
          if (lg) g.label = clean(lg.innerText);
        }
        groups.set(key, g);
        return;
      }

      const f = {
        label: clean(labelFor(el)),
        key,
        kind: el.tagName === "TEXTAREA" ? "textarea" : el.tagName === "SELECT" ? "select" : el.type,
        required: isRequired(el),
        value: el.type === "file" ? "" : String(el.value || "").slice(0, 120),
      };
      if (el.tagName === "SELECT") {
        f.options = [...el.options].map((o) => clean(o.text)).filter(Boolean);
        if (f.options.length <= 1) f.optionsHidden = true;
      }
      // selectize / react-select style widgets: a text input acting as a combobox
      if (el.getAttribute("role") === "combobox" || /selectized/.test(el.id || "")) {
        f.kind = "combobox";
        f.optionsHidden = true;
      }
      if (el.type === "file") f.accept = el.accept || "";
      if (el.type === "range") { f.min = el.min; f.max = el.max; f.step = el.step; }
      if (el.placeholder) f.placeholder = clean(el.placeholder);
      fields.push(f);
    } catch (e) {
      broken++;
    }
  });

  for (const g of groups.values()) fields.push(g);

  const submits = [...document.querySelectorAll('input[type=submit], button[type=submit], button')]
    .map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.id || "", text: clean(b.value || b.innerText), visible: !!(r.width && r.height) };
    })
    .filter((b) => b.text && b.text.length < 60);

  // The full, uncut record — for the rare field the digest clips.
  window.__form = {
    url: location.href,
    host: location.host,
    title: document.title,
    submits,
    hasRecaptcha: !!document.querySelector('[class*="recaptcha"], #g-recaptcha, textarea[id^="g-recaptcha-response"]'),
    fields,
  };

  // ---- digest, paged by field index --------------------------------------
  // The run-JS capability truncates a long return value (~1.5 kB observed), so
  // the digest is handed over in chunks that stop on a field boundary instead
  // of being cut mid-JSON. Every chunk reports `next`; when it is null you have
  // the whole form. Continue with:
  //
  //     window.__digest(next)
  //
  // Short keys: l label, k key/name, t kind, r required, v prefilled value,
  // o options, h options hidden until clicked, a accept, p placeholder,
  // mn/mx range bounds.
  const real = fields.filter((f) => !f.skip);

  const compact = (f) => {
    const d = { l: f.label.slice(0, 90), k: f.key, t: f.kind };
    if (f.required) d.r = 1;
    if (f.value) d.v = String(f.value).slice(0, 60);
    if (f.optionsHidden) d.h = 1;
    if (f.accept) d.a = f.accept.slice(0, 50);
    if (f.placeholder) d.p = f.placeholder.slice(0, 40);
    if (f.min !== undefined) { d.mn = f.min; d.mx = f.max; }
    if (f.options && f.options.length) {
      const opts = f.options.map((o) => (typeof o === "string" ? o : (o.label || o.value) + (o.checked ? " [x]" : "")));
      // A one-option group whose option repeats the question (every consent
      // checkbox ever) carries nothing — say so instead of paying for it twice.
      const same = opts.length === 1 && opts[0].slice(0, 40) === f.label.slice(0, 40);
      if (same) d.o = ["<same text as the label>"];
      else {
        d.o = opts.slice(0, 8).map((o) => o.slice(0, 70));
        if (opts.length > 8) d.o.push("… +" + (opts.length - 8) + " more (window.__form)");
      }
    }
    return d;
  };

  window.__digest = (from, budget) => {
    from = from || 0;
    budget = budget || 900; // measured: the capability truncates near 1.4 kB
    const out = {
      host: location.host,
      title: clean(document.title).slice(0, 70),
      total: real.length,
      from,
      fields: [],
      next: null,
    };
    if (from === 0) {
      if (window.__form.hasRecaptcha) out.recaptcha = 1;
      if (honeypots) out.honeypots = honeypots;
      if (broken) out.unreadable = broken;
      out.submits = submits.filter((b) => b.visible).map((b) => b.text.slice(0, 40)).slice(0, 8);
    }
    let used = JSON.stringify(out).length;
    for (let i = from; i < real.length; i++) {
      const d = compact(real[i]);
      const cost = JSON.stringify(d).length + 1;
      if (out.fields.length && used + cost > budget) { out.next = i; break; }
      out.fields.push(d);
      used += cost;
    }
    return JSON.stringify(out);
  };

  return window.__digest(0);
})();
