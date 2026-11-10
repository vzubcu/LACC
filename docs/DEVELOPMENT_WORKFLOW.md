# Development and release branches

LACC uses two long-lived branches:

- **main** — last promoted, validated release candidate for skill consumers. Do not
  merge unvalidated feature branches directly into main.
- **develop** — integration branch for implementations awaiting the planned
  acceptance and regression test phase. **Code in develop is experimental.**

## Feature integration

1. Start a short-lived `feat/...`, `fix/...` or `docs/...` branch from the latest `develop`.
2. Make one reviewable functional change per PR, target `develop`, and include
   its ROADMAP milestone and known limits. Never mislabel code as tested.
3. Code review may merge an untested PR **into develop**; track its status as
   "implemented / validation pending" instead of "done" or "released".
4. Keep `main` untouched during the integration phase. Avoid any force push
   on `main` or `develop`. Commits use `[skip ci]`; do not rely on hosted Actions
   checks and do not change `.github/` to implement this policy.
5. If a feature fails its tests later, fix it via another `develop` PR or
   revert its merge commit on `develop`. Do not conceal a failed check.

## Validation and promotion gate

Before offering `develop -> main` for promotion, collect **locally executed**
results for:

- Native Windows Node tests, including Git isolated-PATH/no-Python and
  the no-Git fail-closed case;
- Linux or Docker Node tests;
- Python unit tests and real installer smoke in a supported local runtime;
- optional Node/Python parity tests with CPython installed;
- feature-specific fixtures for migration, session freshness, dependency
  staleness, multi-agent conflicts and strict output/scan budgets;
- real agent smoke checks in the supported clients, with git status clean;
- security checks: symlinks, path traversal, non-UTF8, untrusted memories,
  secrets, unexpected file mutation and truncated/incomplete scans.

An acceptance failure blocks promotion until fixed. No test pass is inferred
from authored test code; record actual commands, exit statuses, count of
skips/fails, OS and tool versions.

Only after the validation record is complete open a PR
**`develop` -> `main`**, review all changes and merge with explicit owner
approval. If the current `main` already contains a formerly merged untested
change, preserve history and validate it during the same gate rather than
rewriting the branch. Tag/version a release only after promotion.

## Local usage

For development:

```bash
git fetch origin
git switch develop
git pull --ff-only origin develop
```

Feature PR base: `develop`. Installers using `vzubcu/LACC` from GitHub
resolve the repository default branch (`main`), **not develop**. Developers
must opt into a specific develop branch or commit when testing an
unreleased skill; do not silently replace their global installed copy.

This branching strategy alone does **not** turn off GitHub Actions:
the existing workflow has push and pull_request triggers. Keep all
updates using `[skip ci]` and verify hosted runs are not started. If
the platform disregards skip directives, stop rather than intentionally
consuming hosted CI minutes. No workflow-file edit is part of this policy.
