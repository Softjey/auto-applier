# ATS quirks registry

One file per ATS, keyed by host. Phase 2 reads `form.json`'s `host` field and
loads the matching file before touching anything; Phase 4 follows it while
filling.

## Resolving a host to a file

Try the most specific name first, then fall back:

1. the exact host — `system.erecruiter.pl.md`, `smartapply.indeed.com.md`
2. the registrable domain — `recruitee.com.md` matches `anycompany.recruitee.com`

Multi-tenant platforms (Recruitee, Traffit, Greenhouse, Recruitify) get the
domain-level file, because the quirks belong to the platform and every tenant
inherits them. Use a fully-qualified filename only when the host really is one
specific site — a single employer's own careers page, or a platform that serves
its form from one fixed subdomain.

Where a tenant genuinely differs from its platform, record it as a section
inside the platform file rather than a new file, and say what varied.

## Writing an entry

Every entry here was paid for with a failed submit. When a run discovers a new
quirk, add it in the same commit as the fix — a quirk that stays only in a run
log gets rediscovered the expensive way.

Two rules keep these files useful to anyone but their author:

**Identify controls by DOM handle, not by the words on screen.** Names, ids and
URL paths are stable; visible labels change with the viewer's language, and the
same ATS routinely renders in several. Where a page's own wording is the only
available signal, describe what it means in English and pair it with a
selector.

**Keep them free of one person's answers.** A quirk is "the rate field rejects
anything but an integer", not "send 180". Concrete values belong in
`profile.json`.
