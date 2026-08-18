# ATS quirks registry

One file per ATS host. Phase 2 reads `form.json`'s `host` field and loads the
matching file before touching anything; Phase 4 follows it while filling.

Every entry here was paid for with a failed submit. When a run discovers a new
quirk, add it in the same commit as the fix — a quirk that stays only in a run
log gets rediscovered the expensive way.

Filename is the bare host: `system.erecruiter.pl.md`, `smartapply.indeed.com.md`.
