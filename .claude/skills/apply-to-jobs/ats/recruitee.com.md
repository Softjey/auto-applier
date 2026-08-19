# Recruitee (*.recruitee.com)

Single-page form, one submit button, no captcha challenge in practice (an
hCaptcha widget sits above the button but has never demanded interaction).

## Quirks

**Reached through a page-opened tab that has stayed in the group.** A job
board's Apply opens a new tab; on the runs so far it landed inside the MCP tab
group and was drivable. Do not assume it will — check `tabs_context_mcp` after
clicking.

**React-controlled inputs.** Assigning `el.value` is dropped on the next
render. Use the native setter and dispatch `input`:

```js
Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
el.dispatchEvent(new Event("input", { bubbles: true }));
```

Radios and checkboxes take a plain `.click()`.

**Field names are stable ids, not labels.** Questions are
`candidate.openQuestionAnswers.<id>.content` (text) or `.flag` (yes/no radio,
values `true`/`false`). Consents are `candidate.agreements.0.consent` and more
`openQuestionAnswers.<id>.flag`. Read them off the DOM each run — the ids are
per-vacancy.

**The submit gives no immediate feedback.** The button empties and spins for
~10s with no text. Do not re-click. Poll `location.href` instead.

## Success signal

URL becomes `/o/<slug>/applied`, the tab strip shows an applied chip and the
body confirms the application was sent.
