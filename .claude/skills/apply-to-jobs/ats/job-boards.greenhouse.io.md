# Greenhouse (job-boards.greenhouse.io)

Reached from a company careers page that embeds the form in a cross-origin
iframe (`#grnhse_iframe`). Multi-tenant — these quirks are Greenhouse's, not
any one employer's.

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

**The embed URL expires.** A `validityToken` from an earlier session 404s or
redirects; re-enter through the careers page (`?gh_jid=<id>`) and read
`document.getElementById('grnhse_iframe').src` again to get a fresh one.

**Filter react-select by typing, then press Return.** Clicking option rows by
coordinate works but the page reflows between batched actions; typing a
distinctive fragment of the option ("hands-on", "contributed to modernizing")
and pressing Return is stable. Read the choice back from
`[class*="singleValue"]` — multi-select questions (`question_<id>[]`) render
their answer as `[class*="multiValue"]` chips instead, so check both.

**Coordinate clicks drift when the layout shifts.** A click+type pair aimed by
coordinate landed in nothing after the résumé chip changed the page height;
prefer refs from `find` for text inputs and verify `getElementById(id).value`.

**Country is a combined country/phone widget**: type the country, click the
"<Country> +NN" row; the flag then shows in the Country box and the phone field
reformats what you typed.

**A required consent can be a Yes/No dropdown, not a checkbox.** Housecall Pro
renders the current-vacancy consent as a checkbox ("Yes") and the
future-recruitment consent as a required `Select…` — answering it is mandatory,
consenting is not: choose **No**.

**EEO / demographic sections are optional** (no asterisk); leaving every one at
"Select…" is the opt-out.

## Success signal

URL becomes `/embed/job_app/confirmation?...` and the page reads "Thank you for
applying!" (the title may be localized).
