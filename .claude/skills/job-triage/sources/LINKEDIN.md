# LinkedIn guest search: how it expands and what it honours

Measured against LinkedIn's logged-out job endpoints. The saved search itself is `linkedin/filters.json` in the data repo.

```text
LinkedIn search config. THIS FILE IS THE SAVED SEARCH.

LinkedIn's guest API has no saved-search concept — Job Alerts live behind a
login and are not reachable. So where onetap keeps filters server-side and
replays them with useSavedFilters=true, here this file is the equivalent.
Keep it in sync with onetap:

    # agent saves get_my_filters output to /tmp/onetap-filters.json, then:
    python3 sources/linkedin.py sync-filters /tmp/onetap-filters.json

HOW IT EXPANDS

LinkedIn cannot express 'remote anywhere in Poland OR hybrid/onsite in
Warsaw and Gdansk' in one query — it has a single location box and one
workplace toggle. So the search is a MATRIX: every keyword is crossed with
every location group and every time window, and each cell is fired as its
own request. `search --dry-run` prints the expansion without calling out.

WHAT WAS MEASURED, 2026-09-10 (guest backend)

The endpoint returns a shifting sample. The same query twice, 50 cards
each, shared only 27 of ~47 results. That drift is the control any filter
claim has to beat.

  keywords  WORKS — the endpoint is search-driven, this is the main lever.
  geoId     WORKS, precisely. geoId=105076658 returned 30/30 postings in
            Warsaw; 106191263 returned only Pomorskie (Gdansk, Gdynia).
            A plain `location` string works just as well when no geoId is
            known: 'Gdansk, Pomorskie, Poland' gave 26/26 in the tri-city.
  f_TPR     WORKS. With r86400 every result carried a datetime of today or
            yesterday; without it the same pages reached back to 2025-06-30.

  f_WT      IGNORED — proven, not guessed. f_WT=2 (remote) and f_WT=1
            (on-site) are mutually exclusive, yet over 50 cards each they
            shared 30 results — MORE overlap than the control run. The
            parameter does nothing on the guest backend.
  f_E       UNRELIABLE. f_E=4 (mid-senior) returns 'Not Applicable' and
            'Associate' postings.
  f_JT      UNPROVEN — did not differ from baseline beyond the drift.

So `workplace` below is NOT sent to the guest backend. It is carried as
declared intent: it records which onetap workplace group a location group
came from, rides along on every posting as `expected_workplace`, and would
be sent as workplaceType by an authenticated Voyager backend. Because the
guest backend ignores it, location groups that differ ONLY by workplace are
collapsed into one request instead of being fired twice.

PAGINATION — measured 2026-09-10

The endpoint serves 10 cards a page and reports no total, so the only way
to know a result set is finished is to page until it says so. It ends with
a 0-card page; every page before that came back full. Two queries, run to
the end:

  React / Warsaw / 14d          68 postings over  9 pages
  Typescript / Poland / 14d    402 postings over 45 pages

The old maxPages:3 default therefore saw 28 of 68 and 28 of 402 — the cap
looked like a page limit but was really a silent 93% truncation. There is
now NO page cap: `maxPages` is absent from defaults, and each query runs
until the endpoint runs dry. `--max-pages` still exists for cheap sampling
and should not be used for a real sweep.

Cost follows from that: a full uncapped sweep of all 27 queries is on the
order of 600-900 search requests at ~1.75s each. Check it with
`search --dry-run` and narrow with --keyword / --location when iterating.

  timePosted  r86400 = 24h, r604800 = 7d, r1209600 = 14d, r2592000 = 30d.
              These are LinkedIn's own UI presets, not the only valid values -
              f_TPR accepts ANY r<seconds> (confirmed live 2026-09-15:
              f_TPR=r200000 returned only cards dated within that ~2.3-day
              window). For a narrow ad-hoc ask ('since Saturday') pass
              `search`/`collect --since-days <N>` instead of running the full
              window configured here and throwing most of it away afterwards
              with --max-age-days, which only drops cards client-side AFTER
              they were already paged through and fetched.
  workplace   REMOTE | HYBRID | ONSITE (declared intent, see above)
```

## Dropping a keyword

Measure it first, over one sweep: requests spent, postings no other keyword found, and how many of those were kept. A keyword that adds nothing or only duplicates another goes in `exclude_keywords`, which `sync-filters` honours, so a sync from onetap does not bring it back.
