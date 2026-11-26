# Gates — how a vacancy is judged

This is the procedure, the same for every candidate and every source. The
candidate's own rules (stack, salary floor, locations, companies, seniority,
languages) live in `criteria.md` in the data repo; read both before judging
anything, including a one-off question about a single posting.

Run the gates in order. The first gate that fails ends the evaluation.
Surviving all gates gives `SAVED`. Failing one gives `NOT_INTERESTED` with a
note naming the gate and quoting the disqualifying line. A gate that cannot be
settled from the posting gives `UNDECIDED` with a question.

## Gate 0 — Read the full description

Never decide from the title alone, and never from the `keywords` field. Both are
filled in by the aggregator and routinely overstate a technology that the body
demotes to "nice to have" or never mentions. Two failure modes, mirror images of
each other:

- A clean title hides a disqualifying stack in the body ("Senior Fullstack
  Developer" whose team works in a framework the candidate rejects).
- A loaded title or keyword list names a technology the requirements section
  does not ask for.

Judge on the requirements section. `search_vacancies` already returns
`descriptionText`, so there is nothing to fetch.

## Gate 1 — Primary stack and language

See the stack and language sections of `criteria.md`. Reject when a
disqualifying technology or language is a core requirement. Do not reject when
it appears only under "nice to have", "a plus", or the local equivalent.

## Gate 2 — Role type

The role must be the kind of work the candidate wants (see `criteria.md`).
Judge the work described, not the label: a title can match while the job is
something else.

## Gate 3 — Location

Check the work model and the place against the candidate's table. The `cities`
field is not the work model: many fully remote postings list an office city, and
many "remote" ones are on-site. Trust the description over the field. When it
cannot be settled, return `UNDECIDED` with the question.

## Gate 4 — Salary

Measure against the **top** of the posted range. A band whose ceiling only
touches the floor is a save flagged as weak money, not a rejection. Reject on
salary only when the ceiling sits clearly below the floor. Convert hourly and
daily rates to a monthly figure before comparing, and say which working-days
assumption was used. When no salary is posted, the verdict follows the other
gates and the rate becomes the first question to ask.

## Gate 5 — Company

Look the company up in the candidate's companies table. Permanent bans and
temporary holds are both final for the run. A hold is a reason to withhold a
keeper, so report each one rather than dropping it silently.

## Gate 6 — Seniority

Soft. Salary outranks it. A role below the target level can be saved when the
money and the company are right. When there is no salary to break the tie, a
clean stack carries it.

## Notes

Every status change carries a note in English that names the gate and quotes the
disqualifying line, for example `Framework X is the frontend — "quoted
requirement". Gate 1.` A bare "not a fit" forces the whole batch to be read
again at the next audit.

## Duplicates

About a tenth of a batch is the same posting served by several boards. Keep the
copy with the most information, set the others to `NOT_INTERESTED`, and say in
the note which one was kept. The same posting never sits under two statuses.
`applications-check` does the clustering; this file only states the rule.

## Reading the application statuses

`SAVED` and `NOT_INTERESTED` are the candidate's own verdicts and are reliable.
`APPLIED`, `INTERVIEW`, `TEST_TASK`, `OFFER_MADE` and `HIRED` are strong
positives. `REJECTED` is not a positive signal: it only means the employer said
no, and the set can hold postings the candidate never wanted. Weight recent
decisions far above old ones.

## Keeping the criteria alive

When the candidate corrects a verdict, update `criteria.md` in the data repo in
the same session, with the date and the case. A correction that is not written
down is made again.
