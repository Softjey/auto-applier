# SmartRecruiters "Easy apply" (jobs.smartrecruiters.com)

Multi-tenant. The posting lives at `/{Org}/{reqId}-{slug}`; its "I'm interested"
button opens `/oneclick-ui/company/{Org}/publication/{uuid}` in the same tab —
the application form. Two steps: personal data → **Next** → `/screening`
(preliminary questions + consents) → **Submit** → `/success`.

## Quirks

**The whole form lives in a shadow DOM.** `read_page` returns an empty tree and
`find` sees only a couple of stray controls, so refs are mostly unavailable.
Walk it yourself and drive by coordinate:

```js
const deep=(root,out=[])=>{root.querySelectorAll('*').forEach(el=>{
  if(/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName)) out.push(el);
  if(el.shadowRoot) deep(el.shadowRoot,out);}); return out;};
```

Field ids: `first-name-input`, `last-name-input`, `email-input`,
`confirm-email-input`, `spl-form-element_10` (City), `spl-form-element_5`
(Phone), `linkedin-input`, `facebook-input`, `twitter-input`, `website-input`,
`file-input` (résumé), `hiring-manager-message-input` (optional, leave empty).
Read values back through the same traversal — re-query fresh each time, a node
captured before an upload or a re-render is stale and assignments to it are
silently lost.

**Screenshot coordinates are not CSS pixels.** `window.innerWidth` was 1200
while the screenshot frame was 1509 wide; multiply a `getBoundingClientRect()`
x/y by `frameWidth / innerWidth`, or just read positions off the screenshot.

**Do not return `location` from run-JS on this host** — the URL carries a query
string and the call is blocked as cookie/query-string data. Return
`document.title` or a text sample instead.

**The résumé input is unreachable by ref**, and clicking the dropzone opens a
native picker. What works: inject a visible `input[type=file]` into the light
DOM, upload into it with the upload tool, then move the File across and let the
component read it:

```js
const dt=new DataTransfer(); dt.items.add(bridge.files[0]);
target.files=dt.files;                       // re-query `target` first
target.dispatchEvent(new Event('change',{bubbles:true,composed:true}));
```

After the component reads it, `target.files` goes back to 0 — that is success,
not failure. Confirm by the filename chip rendered under "Resume", then remove
the injected input.

**Phone**: the country code is a separate select already set to the tenant's
country; type digits only. **City** is an autocomplete — type the city, wait,
click the suggestion row ("Warsaw, Mazovia, Poland").

**Experience / Education sections are optional** ("+ Add"); skip them.

**The screening step's comboboxes** (availability, contract type, languages)
open a plain option list under the input — click the row. Languages is
multi-select: pick one, re-open, pick the next, then Escape.

**Consents on the screening step are Yes/No radios, both required.** Answering
the future-recruitment one is mandatory but consenting is not — take "No".
A final "You declare that you have read and agree to the privacy notice"
checkbox is mandatory.

## Success signal

URL becomes `/oneclick-ui/company/{Org}/publication/{uuid}/success` and the page
reads "Application submitted!".
