# HelloFresh careers site (careers.hellofresh.com, Phenom People platform)

## Resume upload freezes the browser tab

Uploading a résumé at the "Please upload your resume or CV" step (first step of
`/global/en/apply?jobSeqNo=...`) reliably froze the tab for the Claude in Chrome extension —
reproduced 3x across fresh tabs on 2026-09-15. After the upload, screenshots and JS execution
both time out (20-40s+) and never recover; the page itself likely runs a long client-side
resume-parse that blocks the render thread. Simplify's own panel shows a spinning "No resume
uploaded" indicator during this, consistent with a stuck parse rather than an upload failure.

**Not yet solved.** Things not yet tried: waiting well past 60s before touching the tab again,
disabling Simplify's autofill before uploading (it may be racing the same file), or uploading
a smaller/plainer PDF. If this recurs, try those before giving up again — don't just retry the
same sequence blindly a 4th time.

## Liveness

The job listing page shows "Confirmed live in the last 24 hours" via Simplify — normal liveness
signal, worked fine before the freeze.
