# OneTap.Work (the aggregator itself)

Not an ATS — Phase 2 starts here, and `vacancy.link` is a OneTap page, not the
employer's form.

**Do not click OneTap's own "Подати заявку" / Apply button** — it opens OneTap's
profile-creation funnel, which is out of scope. The source posting's URL is in
the page's inline scripts; extract it and navigate there:

```js
const hay = [...document.querySelectorAll('script')].map(s => s.textContent).join('\n');
[...new Set((hay.match(/https?:\\?\/\\?\/[^"'\\\s]{10,220}/g) || [])
  .map(u => u.replace(/\\u002F/g, '/').replace(/\\/g, '')))]
  .filter(u => /<company or board>/i.test(u));
```

Filter by the company or job slug — the blob also holds the sidebar's other
employers. Then follow the board's own Apply control to the real ATS.

**Cookies**: "Відхилити" / "Reject".

**The board, not OneTap, is the authority on expiry and on band units** — OneTap
normalises hourly B2B rates to monthly, so quote in the units the board printed.
