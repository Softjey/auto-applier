# Lever (jobs.lever.co)

Plain server-rendered form at `/<tenant>/<job-uuid>/apply` (LinkedIn Apply lands here with
`?source=LinkedIn`). Success: `/thanks`, page text "Application submitted!".

## Quirks (2026-10-01, airSlate)

**The own extension fills it cleanly and the form is not React-controlled**, so selects and radios can be
set from JS (`select.value` + a `change` event, `radio.click()`) and read back with the same properties.
Custom questions are `.application-question` blocks; match on `.application-label`, not on names (they are UUIDs).

**Review what it put in "Current company".** It copied the last employer (a previous employer) into `org` although the
profile says freelance/ended Aug 2026: clear it (optional) rather than claim a current employer.

**"Current location" often reports "the page did not keep the value"** yet reads back as `Warsaw, POL` and the
submit went through; it is optional.

**Pay period / Currency / Employment type are separate required questions** next to the salary box; the extension
leaves them for you (`monthly`, `PLN`, `B2B (Independent contractor)`).

**An hCaptcha element exists in the DOM but stayed invisible** and the submit went straight to `/thanks`. If a
visible challenge ever appears, that is the user's: park the vacancy.

Voluntary EEO survey blocks (race/gender/veteran) are optional: leave empty.
