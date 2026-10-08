# British Council (Eightfold guest apply, careers.britishcouncil.org)

`/careers/apply?pid=<id>` — one page: CV, contact block, address, then selectize-like dropdowns.
The UI language follows the browser (Ukrainian here); option labels are localized.

- Custom dropdowns do not take typed English text: Country is listed under its Ukrainian name (Poland), Nationality as the Ukrainian adjective.
  Click the field, then click the option (use `find` for the option ref when the list is long).
- A previously-uploaded CV with the same name stays attached; check the chip.
- Required with no opt-out: disability (Yes/No) and reasonable adjustments (Yes/No) — answered from
  `qa[]` (disability / reasonable-adjustments). Declaration needs the full name typed.
  "Save my answers for future applications" stays unticked.
- Success: URL `/careers/apply/success?domain=…&pid=…` with a thank-you dialog.
