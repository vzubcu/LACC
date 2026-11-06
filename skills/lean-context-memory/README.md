# lean-context-memory v2.4

A skill from **LACC — Lean Agent Capabilities Collection**.
Portable project memory for agents with Bash, Git and Python 3.9+. No daemon, embeddings
or provider SDK. On Windows provide Git Bash or WSL and Python. Shell wrappers use `python3` or `python`
(or the explicit `PYTHON` environment variable). Use interpreter commands;
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

The common protocol is kept once in AGENTS.md. An explicit `--agent codex`, `claude`,
`gemini` or `roo` only updates that agent's native file plus AGENTS.md; `auto` updates
existing native files but skips symlinks. Claude's native import loads it without
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

Hot-memory health budgets: MEMORY_INDEX.md is at most 60 lines and 4096 UTF-8 bytes;
ACTIVE_STATE.md is at most 30 lines and 2048 UTF-8 bytes. The default recall reads
ACTIVE_STATE first so an oversized index cannot hide the task checkpoint.
For a machine-readable, read-only provenance check:

```bash
python3 /path/to/lean-context-memory/scripts/memory-health.py . --json
```

The JSON response contains `status` (`healthy` or `review`), `findings_total`,
`topics`, `topic_bytes`, and a complete list of findings with stable
`code`/`location` fields. Exit codes remain 0 (healthy), 1 (review needed),
and 2 (invalid configuration/invocation).

Health verification now inventories the Git index once, checks historical
source entries in bounded groups, and hashes each distinct working-tree
source using Git's filters. Staged changes, dirty working trees and
`assume-unchanged` edits remain review signals. Only health scans are
batched; explicit maintenance revalidation still independently checks
selected sources before any write. The tool never stamps facts by itself.

For budgets, selected-fact revalidation and compaction see [maintenance](references/maintenance.md).
For scans and logs see [exploration](references/exploration.md).

## Context pressure advisory

Context-window compaction is separate from persisted-memory compaction. When the host reports
current/main-request input tokens and the active model's context window is known, run:

```bash
python3 /path/to/lean-context-memory/scripts/context-pressure.py \
  --input-tokens CURRENT_INPUT_TOKENS --context-window KNOWN_CONTEXT_WINDOW
```

For Codex, an explicitly supplied session JSONL can be read instead:

```bash
python3 /path/to/lean-context-memory/scripts/context-pressure.py \
  --codex-trace /path/to/session.jsonl --context-window KNOWN_CONTEXT_WINDOW
```

The default policy is advisory: below 70% continue normally; at 70% refresh `ACTIVE_STATE.md`;
at 80% refresh it and recommend the host-native context compact (for example `/compact` where
supported); at 90% avoid substantial new exploration until checkpoint + compaction. Thresholds
can be overridden with `--checkpoint-at`, `--compact-at` and `--urgent-at`.

The script is read-only. It does not discover session traces, infer model context windows, edit
memory, or invoke a host command. If usage or the context window is unavailable, do not fabricate
a percentage. After a host compacts the conversation, reload the hot index/checkpoint with
`memory-read.py`. Observed request input is a pressure proxy, not exact remaining context.

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
