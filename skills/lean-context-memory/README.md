# lean-context-memory v3.2

A skill from **LACC — Lean Agent Capabilities Collection**.
Runtime-adaptive project memory. **Node.js 22+ with Git is sufficient for core
init/read/search/health/doctor/sync on Windows, Linux and macOS**; no Python,
Bash or WSL required for that path. Node uses only built-in modules. The older
Python 3.9+/Bash helpers remain available for advanced maintenance and tools.
If no Node exists, follow the limited native-agent fallback described below.
Windows-specific Node validation is pending; Linux local smoke passed.

## Install and initialize

```bash
npx skills add vzubcu/LACC --skill lean-context-memory
```

Ask the agent to use the detected compatible runtime and populate memory
from verified sources. On Windows PowerShell or any Node-supported shell:

```powershell
node <skill_dir>/scripts/lacc.mjs capabilities
node <skill_dir>/scripts/lacc.mjs init . --agent claude
```

Replace `<skill_dir>` with the actual installed skill path. This is a
bundled script, **not** a published `npx lacc` package. The Bash/Python
initializer remains an optional legacy alternative.

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

## Develop preview: session-start gate

The experimental `develop` version adds `session-check`, a bounded
read-only inspection of source-backed facts and HOT checkpoint validity
before trusting a new session's memory. It reports incomplete coverage
instead of declaring all facts verified. There is no guaranteed
automatic hook across every agent. Run after installing that version:

```powershell
node <skill_dir>/scripts/lacc.mjs session-check . --json
```

Do not treat `status: review` or `incomplete` as a semantic failure
of every claim; inspect evidence manually. No memory is auto-corrected.

## Daily operations — Node.js runtime

```powershell
node <skill_dir>/scripts/lacc.mjs sync .
node <skill_dir>/scripts/lacc.mjs read .
node <skill_dir>/scripts/lacc.mjs read . --topic architecture.md
node <skill_dir>/scripts/lacc.mjs search . --query "OIDC session" --json
node <skill_dir>/scripts/lacc.mjs health . --json
node <skill_dir>/scripts/lacc.mjs doctor . --json
```

These commands do not require Bash/WSL/Python. Git is required for confirmed
source evidence; without Git the CLI cannot confirm a fact. The Node CLI
supports explicit `sync --strict` and guarded `sync --stamp`.
The Python/Bash helpers are retained for existing workflows and features
not yet implemented in the Node CLI.

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

## Develop preview: legacy memory migration preparation

A local, dependency-free Node tool now supports read-only legacy-memory
inventory and deliberate byte-for-byte snapshot creation:

```powershell
node <skill_dir>/scripts/lacc.mjs migration-audit .
node <skill_dir>/scripts/lacc.mjs migration-backup .
node <skill_dir>/scripts/lacc.mjs migration-backup . --apply --expect <digest_from_preview>
node <skill_dir>/scripts/lacc.mjs migration-inspect . --snapshot <digest_from_preview>
```

Backups live outside WARM topics, remain private and never certify a legacy
claim. Existing files are not rewritten. See [maintenance](references/maintenance.md).
This is not an automatic migration or one-click restore.

## Runtime coverage and fallback

See [runtime compatibility matrix](references/runtime.md): Node is the
preferred cross-platform core, Python/Bash remain optional for advanced
maintenance, and native agent file/Git tools give a limited manual mode
when no executable runtime exists. A Markdown skill cannot execute checks
without a capable runtime; do not fabricate verified provenance. Bundled
CLI source does not need npm install or a model-provider SDK.

For local validation without GitHub Actions:

```bash
node --test tests/test_node_runtime.mjs
```

Run that command from the **repository root**. The six local Node runtime
tests passed on Linux. Native Windows and complete Python parity tests are
still pending; this is not evidence of model-token savings.

## Memory v3.0 — task-aware retrieval

The original HOT index/checkpoint remains bounded and loads once at task start.
WARM facts under `memory/topics/` can now be searched by task phrase using a
local, read-only lexical ranker. No embeddings, daemon, external LLM or network:

```bash
python3 /path/to/lean-context-memory/scripts/memory-search.py . \
  --query "OIDC Keycloak session persistence" --limit 5 --max-bytes 5000

# Optional structured output
python3 /path/to/lean-context-memory/scripts/memory-search.py . \
  --query "event consumer contract" --json
```

Each default result must have confirmed provenance and **unchanged Git-backed
source evidence**. Changed, missing, unverified and review-state facts are not
returned by default. `--include-review` shows visibly flagged candidates
for investigation, never automatically promoted. Incomplete scans, verification
caps and byte truncation are reported. Results are lexical recommendations
for *where to inspect*, not proof that a claim is semantically correct.

New installs also create `memory/topics/decisions.md` and
`memory/topics/lessons.md` with empty, example-only instructions. Existing
projects can rerun init-memory.sh safely; it does not overwrite existing
facts, but old index pointers should be reviewed before adding new ones.
HOT = ACTIVE_STATE + MEMORY_INDEX; WARM = source-backed topics;
COLD is historical knowledge not loaded automatically and is not indexed
in this release. See [retrieval guide](references/retrieval.md).

## Memory v3.1 — read-only self-healing diagnostics

Some facts describe the same durable rule. Give these facts an optional stable
identity, for example:

```markdown
- Authentication requires tenant scoping | source: `src/auth.ts` | verified: `CHECKED_COMMIT` | key: auth.tenant.scoping
```

Replace `CHECKED_COMMIT` with a commit you actually inspected. The key is
a lower-case dotted identifier (max 96 chars); existing unkeyed facts remain valid.
Two *different claims* sharing the same key produce a **potential-conflict**,
not a claim that the facts are definitively contradictory. `memory-health.py`
reports it and `memory-search.py` excludes those claims by default.

When health reports conflicts, stale sources or review-state facts, run the
new optional, entirely local, **read-only** triage tool:

```bash
python3 /path/to/lean-context-memory/scripts/memory-doctor.py . --json
```

The doctor supplies source-specific review actions, counts, and capped output.
It does not edit facts, guess replacement content, auto-stamp or call an AI.
Manual evidence review and tests are required before applying corrections.
`memory-maintain.py revalidate` now retains the optional `key` metadata.

The doctor and keyed conflict detection are opt-in safety aids, not background
workers. Use on health warnings or before a risky memory migration, **not**
on every trivial task. See [self-healing contract](references/self-healing.md).

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

## Correct context signals vs request tokens

The read-only `context-pressure.py` now accepts host-reported active-context
tokens directly, or (when supplied) reads `last_token_usage.total_tokens`
and `model_context_window` from an explicit Codex session trace. This is
different from cumulative session usage. The legacy `--input-tokens` remains
available but is clearly labeled as a rough request-input proxy.

```bash
# When a host reports active context and window
python3 scripts/context-pressure.py --used-context-tokens 120000 --context-window 200000

# When a Codex token_count event provides both values
python3 scripts/context-pressure.py --codex-trace /private/session.jsonl --json
```

A missing context window is never inferred from the model name. Reported
context pressure is advisory only and never invokes `/compact`.

## Benchmarking in Rider and Codex CLI

For JetBrains AI Assistant → Claude Agent, use the optional
`session-totals.py` comparator with independently verified total tokens
per distinct completed session, obtained from JetBrains Session explorer
**only if it is available for your account and session**:

```bash
python3 scripts/session-totals.py baseline.jsonl optimized.jsonl --json
```

This comparator reports only *total-token* savings; it never fabricates
input/output/cache counts. The in-IDE context indicator and AI credits
are not substitute token totals.

Codex CLI `codex exec --json` streams can instead be normalized by
`usage-report.py capture-codex-exec`; internal Codex session rollouts use
the separate `capture-codex` mode. Both require complete traces and
independent quality validation. See the [benchmark protocol](references/benchmark.md)
for the matched-run data contract and restrictions.

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
