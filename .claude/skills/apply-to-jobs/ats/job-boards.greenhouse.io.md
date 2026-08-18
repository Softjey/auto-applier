# Greenhouse (job-boards.greenhouse.io)

Reached from a company careers page that embeds the form in a cross-origin
iframe (`#grnhse_iframe`).

## Quirks

**The form is unreachable from the parent page.** `javascript_tool`,
`read_page` and `get_page_text` all see only the wrapper. Navigating straight
to `job-boards.greenhouse.io/<org>/jobs/<id>` just redirects back to the
company site. What works: read the iframe's own src and navigate the tab to it —
`document.getElementById('grnhse_iframe').src` then assign `location.href`.
The tab then hosts the form same-origin.

**Do not return `location.href` from `javascript_tool`** on this host — the
embed URL carries a long `validityToken` query string and the call is blocked as
cookie/query-string data. Return `location.host` instead.

**Fields are keyed by `id`, not `name`.** `document.querySelector('[name=...]')`
finds nothing; use `getElementById('first_name')` etc. Custom questions are
`question_<numeric id>`.

**Every dropdown is react-select** — programmatic value assignment does nothing.
Click the control, type to filter, click the option row. To read back what was
chosen, walk up from the input to the nearest `[class*="singleValue"]` node;
the input itself holds only the search text and reads empty.

**The resume input disappears after upload.** `getElementById('resume')` returns
null once a file is attached — that is success, not failure. Verify by finding
the filename chip in the DOM.

## Success signal

URL becomes `/embed/job_app/confirmation?...` and the page title changes to a
thank-you.
