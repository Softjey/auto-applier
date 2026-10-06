# Contributing

Thanks for helping. A few rules keep this repo safe to share:

- **No personal data, ever** — not in code, skills, ATS notes, tests or fixtures. Use
  the fake person in `autofill/fixtures/` and placeholders like `<config.resumeFileName>`.
  A quirk goes in `.claude/skills/apply-to-jobs/ats/<host>.md` as "the rate field
  rejects non-integers", never as one person's answer.
- Skills and scripts live in `.claude/skills/`; `.agents/skills/` holds symlinks. A new
  skill needs its symlink in the same commit.
- Commits follow Conventional Commits.

## Checks

```sh
node .claude/skills/apply-to-jobs/scripts/test-story-themes.mjs
cd autofill && pnpm install && pnpm check   # typecheck, lint, format, vitest
```

`pnpm --filter @applier/e2e test` runs the Playwright suite and needs a browser.
