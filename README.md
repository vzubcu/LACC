# LACC — Lean Agent Capabilities Collection

**Portable skills for AI agents.**

LACC is an extensible collection of independently installable skills. The first available
skill is lean-context-memory, which includes advisory context-pressure monitoring and optional token-usage benchmarking. Planned
domains include .NET Framework, security, compliance and other workflows; their implementation
will be listed in the catalog when available. The catalog is independent of any one agent,
provider or programming language.

## Install

From your project directory, run:

```bash
npx skills add vzubcu/LACC --skill lean-context-memory
```

Choose your agent in the installer. Node.js 22.20+ and Git are needed for installation.
The core runtime is now a **bundled Node.js CLI** and needs no Bash, WSL or Python; Git is required for verified source evidence. The older Python/Bash helpers are optional for advanced maintenance.
No model-provider SDK is required. The examples use the installer's current stable version.

For a specific agent, without interactive prompts:

```bash
npx skills add vzubcu/LACC --skill lean-context-memory --agent claude-code -y
```

Replace `claude-code` with `codex`, `gemini-cli` or `roo`; multiple agents can follow `--agent`.
Add `-g` to install across projects. Add `--copy` if your system does not support symlinks.
The default installs into the current project. Review the installer's destination summary.

Then ask your agent:

> Initialize lean-context-memory in this project using the installed skill, populate memory from verified sources, and report pending checks.

Installation makes the skill available; initialization creates the project's memory and instruction bridges.
It does not automatically certify memory, run a model, or establish token savings.

## Universal runtime (Memory v3.2)

A skill installation alone does not guarantee a compatible runtime. After
installing, let the agent detect the available tools. When Node.js 22+ exists
(including Windows without WSL/Python/Git Bash), execute the CLI included
inside the skill:

```powershell
node <skill_dir>/scripts/lacc.mjs capabilities
node <skill_dir>/scripts/lacc.mjs init . --agent claude
node <skill_dir>/scripts/lacc.mjs sync .
node <skill_dir>/scripts/lacc.mjs search . --query "tenant isolation" --json
node <skill_dir>/scripts/lacc.mjs health . --json
node <skill_dir>/scripts/lacc.mjs doctor . --json
```

Replace `<skill_dir>` with the installed skill directory. Do **not** use
`npx lacc`: this repository does not publish a standalone npm CLI.
Node commands use no third-party packages or cloud APIs. Git is required to
confirm sources; without Git, recalled facts must remain unverified.

Advanced Python/Bash helpers (reviewed revalidation, persisted compaction,
dependency graph, AST and log slicing, provider usage import) are retained
and **not** claimed as ported. When Node and Python are both absent, agents
can follow a limited manual memory workflow through native file/Git tools
and must state which guarantees are unavailable.

Run the portable Node tests locally without hosted CI:

```bash
node --test tests/test_node_runtime.mjs
```

[Runtime capability matrix and fallback](skills/lean-context-memory/references/runtime.md).

## Catalog

| Skill | Purpose | Guide |
|---|---|---|
| `lean-context-memory` | Source-backed memory, bounded recall, reviewed maintenance, exploration and optional usage benchmarking | [Setup and migration](skills/lean-context-memory/README.md) |

```bash
# Discover available skills without installing
npx skills add vzubcu/LACC --list

# Choose skills and agents interactively
npx skills add vzubcu/LACC

# Update this skill (project scope)
npx skills update lean-context-memory -p -y
```

For a global installation, use `-g` instead of `-p`. After updating or moving an installation,
ask the agent to initialize it again: this refreshes helper paths and marked rules while preserving memory.
The command installs the current repository content. CI pins its installer version separately so validation remains reproducible.
For a reviewed snapshot, use a GitHub tree URL with a specific commit instead of the shorthand.
See the [installer reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md).

## Memory v3.0 — find relevant project knowledge

LACC can now search source-backed project memory without loading entire
topic files into the agent context:

```bash
python3 /path/to/lean-context-memory/scripts/memory-search.py . \
  --query "authentication token session rotation" --limit 5 --max-bytes 5000
```

The local ranker scores lexical relevance, checks unchanged Git evidence
and excludes stale/review records by default. It is read-only and has
bounded scan/output limits. Additional decision and lesson templates allow
agents to retain **why a design was chosen** and **which validated fix
prevented a recurring issue**. No vector database, provider keys, daemon,
background jobs or automatic memory edits are needed.

See [retrieval contract](skills/lean-context-memory/references/retrieval.md).
This capability improves *selective recall*; actual model-token savings
remain unmeasured until a controlled A/B benchmark is completed.

## Memory v3.1 — self-healing without automatic rewrites

A read-only `memory-doctor.py` now helps investigate stale evidence and
possible conflicts between facts sharing an explicit, stable `key`:

```bash
python3 /path/to/lean-context-memory/scripts/memory-doctor.py . --json
```

Results include a diagnosis, affected memory locations and safe next steps,
while preserving every fact until a human/agent verifies real sources and tests.
The checker recognizes `potential-conflict` but does **not** claim semantic
contradiction, pick a winning fact, or rewrite code. Keyed conflicting facts
are withheld from default retrieval.

[Self-healing design and limits](skills/lean-context-memory/references/self-healing.md).

## Context pressure and safe compaction

For host-reported active-context usage and an exact context window,
`context-pressure.py` can produce a read-only advisory:

```bash
python3 /path/to/lean-context-memory/scripts/context-pressure.py \
  --used-context-tokens 150000 --context-window 200000
```

For a supplied Codex JSONL session, the helper prefers
`last_token_usage.total_tokens` as active context and reads
`model_context_window` when present. A legacy `--input-tokens`
observation is labeled as a weaker request proxy.

Default thresholds are 70% checkpoint, 80% compact recommended and 90% urgent; all are configurable.
The tool never discovers traces, edits memory, invokes `/compact`, or guesses missing model limits.
Before host-native compact, refresh `memory/ACTIVE_STATE.md`; afterward reload the hot memory.

## Machine-readable memory health (optional)

For scripts or agent tools that need structured results:

```bash
python3 /path/to/lean-context-memory/scripts/memory-health.py . --json
```

The checker reports full source-backed findings as JSON and preserves its
0/1/2 exit-code contract. Git source verification is batched by historical
revision with bounded path groups, while each distinct worktree source
is still hashed through Git to detect hidden or staged edits.

These are reliability and local performance improvements; they do not
prove any model-token saving. Local regression tests require no hosted runners:

```bash
python3 -m unittest discover -s tests -v
```

## Rider Claude Agent benchmarks without made-up token counts

If your JetBrains AI account exposes **Session explorer** with settled
per-session token totals, record distinct matched baseline/skill sessions and
compare total usage locally:

```bash
python3 skills/lean-context-memory/scripts/session-totals.py baseline.jsonl optimized.jsonl --json
```

The tool reports total-token savings and independent quality status; it
does not infer cache, prompt, completion or dollar costs. If Session explorer
is unavailable, Rider's context percentage does **not** provide a valid
total-token benchmark. Codex CLI `codex exec --json` is supported separately
via `usage-report.py capture-codex-exec`.

## How savings are measured

**Status: no completed real-model A/B savings result is published.** Passing helper tests,
installer checks, a handoff exercise or shrinking SKILL.md do not establish net token savings.

1. Run fixed tasks with and without lean-context-memory v2.4 in fresh sessions. Also compare
   against the host's native memory; compare v2.3 separately when evaluating the upgrade.
2. Match the application fixture, prompt, exact model, agent/tool versions, reasoning settings,
   permissions and acceptance tests. Alternate variant order and start with five pairs per task.
3. Count the complete run: instructions, bootstrap, exploration, retries, memory maintenance,
   compaction and final checks. Keep cold-start and warmed-memory experiments separate.
4. Import actual provider/host-reported usage with `lean-context-memory/scripts/usage-report.py`.
   Compare normalized records and report failures as well as increases in usage.

Report total input/output tokens, cached input, paired median/range and acceptance pass rates.
Peak observed request input is a context proxy, not exact context-window occupancy. Cost also
depends on cache/pricing and must be reported separately. A byte limit is not a token measurement.
Savings are `(baseline - skill) / baseline * 100`; a failed/unverified output blocks a savings claim.

See the [measurement protocol](skills/lean-context-memory/references/benchmark.md) and
[benchmark plan/status](benchmarks/README.md). The importer does not launch or pay for model runs.

## Existing installations

The repository was renamed to `vzubcu/LACC`; installed skill names remain unchanged.
Existing clones can update their remote:

```bash
git remote set-url origin https://github.com/vzubcu/LACC.git
```

For installer-managed updates, use the original scope:

```bash
npx skills update lean-context-memory -p -y
# Global installation instead:
npx skills update lean-context-memory -g -y
```

If an older/manual installation has no source metadata, or you want to rebind its source
to the renamed catalog, reinstall into the same scope and agent. For a global Codex copy:

```bash
npx skills add vzubcu/LACC --skill lean-context-memory --agent codex -g --copy -y
```

Preserve any custom edits to the installed package before replacement. Project `memory/`
files are separate from installed skill resources; rerun initialization afterward to refresh
marked rules and helper paths while preserving existing project facts.

v2.4 keeps daily memory and benchmarking operationally separate without splitting them into
different installable skills. Update lean-context-memory and rerun initialization to refresh
marked rules and helper paths. The optional measurement tools remain under
`skills/lean-context-memory/scripts/` and do not run during normal memory operations.
Default sync is advisory; use `--strict` for review gates. Storage caps are now opt-in,
and `memory-read.py` enforces a separate recall-output budget.

Skill sources now live in `skills/lean-context-memory/`. Existing installed copies continue to work.
If you run helpers directly from a clone, change `scripts/...` to
`skills/lean-context-memory/scripts/...` and rerun initialization to refresh stored paths.
Remove an older manually installed copy after verifying the replacement, so the agent does not load two copies.

## Memory safety and local regression checks

Memory health now uses the same fact grammar as maintenance, including fenced examples and
inline shell pipes. Hot reads prioritize `ACTIVE_STATE.md`; indexes are capped at 60 lines /
4096 UTF-8 bytes and checkpoints at 30 lines / 2048 bytes. Broad reference searches exclude
common private credential files. The log slicer only writes stdin to disk with `--keep`.
Explicit `--agent` initialization updates only that agent's native instruction file plus
`AGENTS.md`.

Run local checks without GitHub-hosted runners:

```bash
python3 -m unittest discover -s tests -v
```

These are helper correctness tests, **not** evidence of measured token savings.

## Maintain and extend

Each skill is self-contained under `skills/<name>/`, with one `SKILL.md` and its own resources.
There is no build step, generated duplicate, npm publishing credential or custom installer to maintain.
New skills can join the same catalog without changing existing install commands.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout and checks.
CI tests helper behavior and real CLI installation, including resource integrity and initialization.
Client behavior and actual token savings require separate end-to-end evaluation.
