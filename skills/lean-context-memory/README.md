# lean-context-memory v2.4

A skill from **LACC — Lean Agent Capabilities Collection**.
Portable project memory for agents with Bash, Git and Python 3.9+. No daemon, embeddings
or provider SDK. On Windows provide Git Bash or WSL and Python. Use interpreter commands;
executable bits are not required. Tests cover Linux helper/installer behavior, not every agent client.

## Install and initialize

```bash
npx skills add vzubcu/LACC --skill lean-context-memory
```

Ask the agent to initialize the installed skill and populate memory from verified project sources.
Or run from the project root:

```bash
bash /path/to/lean-context-memory/scripts/init-memory.sh . --agent claude
```

| Target | Entry point |
|---|---|
| `codex` | AGENTS.md |
| `claude` | CLAUDE.md with native `@AGENTS.md` import |
| `gemini` | GEMINI.md bridge |
| `roo` | .roo/rules/lean-context-memory.md bridge |
| `auto` | AGENTS.md and existing native files |
| `all` | All listed entry points |

The common protocol is kept once in AGENTS.md. Claude's native import loads it without
requiring a discretionary Read tool call. Imports include all existing AGENTS.md content;
check it for conflicting user rules. Other hosts follow their short bridges with their own tools.
See [Claude Code imports](https://code.claude.com/docs/en/memory#import-additional-files).
Native auto-memory is not disabled. Choose one canonical project fact store and use the others
for preferences or pointers; do not duplicate project facts into competing stores.

Initialization preserves existing facts and unrelated instruction blocks. New topics are empty
apart from guidance; health may pass structurally while ACTIVE_STATE remains UNSYNCED.
Populate and semantically verify real facts before stamping. No script certifies their truth.

## Daily operations

```bash
bash /path/to/lean-context-memory/scripts/sync-memory.sh .
python3 /path/to/lean-context-memory/scripts/memory-read.py .
python3 /path/to/lean-context-memory/scripts/memory-read.py . --topic architecture.md
python3 /path/to/lean-context-memory/scripts/memory-health.py .
```

Default sync checks Git drift without a whole-memory audit. It returns 0 for an advisory
report, including review-needed or UNSYNCED states. `--strict` also runs health and returns
1 when review is required; `--stamp` always uses strict checks. Errors return 2.
Health: 0 structural checks passed, 1 review needed, 2 invalid invocation/configuration.
No-Git projects remain unverified. Source-file changes are conservative review signals;
unchanged signatures or a successful linter do not prove unchanged semantics.

Only unchanged untracked instruction files recorded as newly created by bootstrap are
suppressed from source drift. User edits to those files and tracked instruction changes still count.
Keep `memory/.bootstrap.json` with the memory if that behavior is desired. This metadata is
a local convenience, not trusted evidence or a security boundary.

For budgets, selected-fact revalidation and compaction see [maintenance](references/maintenance.md).
For scans and logs see [exploration](references/exploration.md).

## Upgrade from v2.3

Reinstall/update using `skills`, then rerun initialization to refresh marked rules and helper paths.
Existing topics and checkpoint are preserved. Remove only unused example bullets containing
`path/to/...` or `<checked-commit>` after confirming they are placeholders, and validate real facts.

- Default sync is now advisory; use `--strict` for shell/CI review gates.
- Default disk caps are removed. Existing configured `topic_bytes`/`topics_total_bytes` still apply.
- `load_bytes` controls recall output; storage is never silently deleted.
- `usage-report.py` remains optional tooling in this skill under `scripts/`; normal memory
  operations do not invoke it. See [benchmark protocol](references/benchmark.md) before measuring.
- No hooks are installed. Agent-specific automation and measured A/B savings remain separate work.

Update installed skills using their original scope (`-p` project, `-g` global):

```bash
npx skills update lean-context-memory -g -y
```

An older manually copied skill without source metadata first needs `skills add` from this repository
in the same scope/agent. Back up local customizations before replacing an installed copy.

## Optional usage benchmarking

Benchmarking is bundled with this skill but is not part of the daily memory path. It makes no
provider API calls and does not run automatically. Read [the benchmark protocol](references/benchmark.md)
first, then use `python3 scripts/usage-report.py --help` for supported import and comparison commands.
Real token savings require matched end-to-end model runs; synthetic tests do not establish a savings claim.
