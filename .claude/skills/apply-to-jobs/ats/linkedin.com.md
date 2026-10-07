# LinkedIn Easy Apply (linkedin.com/jobs/view/<id>)

Easy Apply is a modal dialog on the posting page. Postings with an "Apply" anchor
instead go to an external ATS (see `browser/README.md`, "From a LinkedIn posting to
the ATS in one call"); no anchor but an "Easy Apply" button means this file.
Signed-in session is required; never sign in or solve a challenge.

## Resume upload: the native file dialog cannot be driven

LinkedIn's "Upload resume" button opens an OS file picker, which no browser tool can
reach, and the real `<input type=file>` is never in the DOM until the click. Solve it
by intercepting that input and giving it a stable handle for `file_upload`:

1. After every navigation (the patch dies with the page), install the hook and open
   the dialog in one JS call:

   ```js
   const oc=HTMLInputElement.prototype.click;if(!oc.__li){const h=function(){if(this.type==='file'){this.setAttribute('aria-label','LI resume upload');this.style.cssText='display:block;position:fixed;top:5px;left:5px;width:220px;height:28px;opacity:1;z-index:2147483647';document.body.appendChild(this);window.__fi=this;return}return oc.apply(this,arguments)};h.__li=1;HTMLInputElement.prototype.click=h}window.__fi=null;const b=[...document.querySelectorAll('button')].find(x=>/easy apply/i.test(x.innerText));b?(b.click(),'clicked'):'no easy apply'
   ```
2. On the Resume page, click the upload button through JS. The dialog lives in a
   shadow root, so walk shadow roots (`e.shadowRoot`) for a `button` whose text matches
   /upload resume/i and call `.click()`; `window.__fi` is then set.
3. `find` "LI resume upload file input", then `file_upload` the run folder's CV on that
   ref (it appears as `button ... (file)`).
4. Verify: toast "Resume uploaded successfully" and the first radio is the new file
   (dated today). Earlier uploads pile up under the same filename, so the newest is
   always first.

The same walk works for the dialog buttons: `Next`, `Review`, `Submit application`
are found by exact innerText through shadow roots; coordinate clicks also work
(footer button sits at the bottom right of the dialog).

## Quirks

- **Fill inputs with `form_input`** (by `find` ref), not `computer type`. Phone is
  `type=tel`; the country code is already Poland (+48) and the email is prefilled.
- **"Mark this job as a top choice" (Premium)** is optional: leave unticked.
- **"Follow <company>"** on the Review page is ticked by default: untick it before
  Submit, it is a standing subscription, not part of the application.
- **Additional Questions are the employer's** and can be required numeric
  "years of experience with X" or Yes/No boxes. Phase 3 cannot see them before the
  dialog is open, so resolve them from `qa[]` on the spot; a missing fact means close
  the dialog (X, then **Discard**) and park the vacancy with `pending.md`. Do this
  before spending a CV upload on a vacancy you will park.
- **Salary shown in the header** (`$30/yr - $40/yr`) is LinkedIn's own guess and often
  mislabels hourly pay as yearly. Run it through `salary-quote.mjs` as an hourly band
  before applying; a band under the floor is exit 3, ask the user.
- **Simplify** pops up "Add Custom Application" after Submit: Cancel it.
- **Draft dialog:** closing the form asks "Save this application?"; choose Discard so
  nothing half-filled lingers.
- **Posting mismatch is not an error:** a posting may demand something the user does
  not have (a language, say). Do not claim it on the form; note it in the OneTap note.

## Success signal

Dialog turns into "Your application was sent to <company>!" and the URL loses the
tracking query. Record it as the evidence screenshot, then mark APPLIED.
