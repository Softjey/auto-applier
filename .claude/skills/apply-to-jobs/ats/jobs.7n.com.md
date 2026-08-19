# 7N (jobs.7n.com)

Reached from an aggregator's "apply on the company site" control — opens the 7N
job page in a new tab inside the group. Three-step wizard behind the page's
`Apply now`.

## ⚠️ Ends in a visible reCAPTCHA — cannot be finished unattended

Step 3 carries an "I'm not a robot" checkbox widget above `Submit`. Solving or
clicking it is off-limits. Fill everything else, tick the terms box, then hand
the tab to the user for two clicks: the captcha and `Submit`. Do NOT mark the
vacancy APPLIED until they confirm.

## Quirks

**Cookiebot buries the accessibility tree.** The consent dialog injects ~2400
nodes, so `find` returns cookie-vendor rows instead of form controls. Decline
with `#CybotCookiebotDialogBodyButtonDecline` ("necessary cookies only"), then
*remove the leftover nodes* before using `find`:

```js
document.querySelectorAll('[id^="CybotCookiebot"]').forEach(e => e.remove());
```

Only after that does `find` see the file input.

**Phone is split.** A country-code selector sits next to `mobile`. Writing a
prefixed, spaced number into `mobile` doubles the prefix AND fails validation
("numbers only, no spaces"). Write the national number, digits only.

**Step 1** — `firstName`, `middleName` (optional), `lastName`, `emailAddress`,
country select, `postCode`, `city`, `mobile`, then `NEXT`.

**Step 2** — the area-of-specialization control is a searchable combobox with no
`<select>` behind it: click it, type, click the row. Its taxonomy is narrower
than most job titles — there is no "Fullstack" entry, and a search for it
returns "No items found". Read the available rows and pick the closest one
rather than assuming a term exists. Then the CV file input (PDF/DOC, max 2 MB)
and `linkedIn`.

**Step 3** — review page, an optional free-text box, the terms checkbox and the
captcha.

## Success signal

Not reachable unattended — see the reCAPTCHA note above. Confirm with the user.
