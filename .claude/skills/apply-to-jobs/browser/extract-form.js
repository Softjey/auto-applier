// Phase 2 field-schema extractor. Paste this whole file as the `text` of
// mcp__claude-in-chrome__javascript_tool, then save the returned JSON to
// runs/<run-id>/<Company>_<vacancyId>/form.json.
//
// It only READS. It never types, clicks or submits — Phase 2 must be able to
// run over every vacancy in the queue without touching a single employer.
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
    const row = el.closest("tr, .form-group, .field, div");
    if (row) {
      const txt = (row.innerText || "").trim().split("\n")[0];
      if (txt) return txt;
    }
    return "";
  };

  const clean = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 200);
  const isRequired = (el) => {
    if (el.required || el.getAttribute("aria-required") === "true") return true;
    return /\*/.test(labelFor(el));
  };

  const fields = [];
  const groups = new Map(); // radio/checkbox groups keyed by name

  document.querySelectorAll("input, select, textarea").forEach((el) => {
    if (el.type === "hidden") return;
    const key = el.name || el.id || "";
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    const visible = !!(rect.width && rect.height) && style.visibility !== "hidden";

    // Honeypots are the anti-autofill traps some ATSes (eRecruiter) put in
    // front of the real control. Writing into one silently loses the answer.
    if (HONEYPOT_RE.test(key) || (!visible && el.type !== "file" && !el.disabled)) {
      fields.push({ label: clean(labelFor(el)), key, kind: "honeypot", skip: true });
      return;
    }

    if (el.type === "radio" || el.type === "checkbox") {
      const g = groups.get(key) || {
        label: clean(labelFor(el.closest("fieldset") ? el : el)),
        key,
        kind: el.type === "radio" ? "radio-group" : "checkbox-group",
        required: false,
        options: [],
      };
      const optLabel = clean(labelFor(el)) || el.value;
      g.options.push({ value: el.value, label: optLabel, checked: el.checked });
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
    if (el.placeholder) f.placeholder = clean(el.placeholder);
    fields.push(f);
  });

  for (const g of groups.values()) fields.push(g);

  return JSON.stringify(
    {
      url: location.href,
      host: location.host,
      title: document.title,
      // Submit-ish controls, so Phase 4 knows what it is aiming at and can
      // tell a real submit from a hidden inactive twin.
      submits: [...document.querySelectorAll('input[type=submit], button[type=submit], button')]
        .map((b) => {
          const r = b.getBoundingClientRect();
          return {
            id: b.id || "",
            text: clean(b.value || b.innerText),
            visible: !!(r.width && r.height),
          };
        })
        .filter((b) => b.text && b.text.length < 60),
      hasRecaptcha: !!document.querySelector('[class*="recaptcha"], #g-recaptcha, textarea[id^="g-recaptcha-response"]'),
      fields,
    },
    null,
    1,
  );
})();
