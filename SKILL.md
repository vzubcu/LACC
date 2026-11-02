---
name: lean-context-memory
description: Use when coding, debugging, exploring, refactoring or handing off a project and its context or memory needs to stay compact, current and verifiable.
---

# Lean Context & Memory Protocol (v2.3)

Reduce end-to-end token usage while preserving correctness and reusable project knowledge.
Follow the user's task scope and higher-priority instructions; skill rules do not authorize unrelated changes.

## 0. Initialize or upgrade
Run `bash <skill_dir>/scripts/init-memory.sh [project_dir] [--agent auto|codex|claude|gemini|roo|all]`.
Populate the created templates from project manifests, code and observed checks.
Existing memory is preserved; initialization does not verify it or stamp HEAD.
For v2.2 memory, migrate facts in each topic before relying on that topic; the health check identifies remaining legacy entries.
Keep helper paths outside project memory and invoke scripts via their interpreter.
Requirements: Bash, Git and Python 3.9+; ripgrep is optional.
The core protocol is agent-neutral: use the host's native file/search/edit/terminal tools.
Bootstrap keeps the common protocol in AGENTS.md and uses thin native bridges in CLAUDE.md,
GEMINI.md or .roo/rules/lean-context-memory.md; default auto updates only existing native targets.
No Codex executable, SDK, session format or usage collector is required for memory operations.
If the host cannot run helpers, apply the file workflow manually and report mechanical checks unverified.

## 1. Keep work and output lean
- Give concise conclusions; preserve exact commands, signatures, errors and safety-critical details.
- Search with `rg`, batch independent reads and inspect signatures before targeted ranges of large files.
- Keep large payloads out of the conversation: query locally and return relevant excerpts.
- Filter noisy output or use `bash <skill_dir>/scripts/ctx-slice.sh <file> 100`; retain full logs locally and disclose omitted coverage.
- Use focused checks during iteration and the required suite before completion; quiet output must retain failures and exit status.
- After an edit, inspect the diff and run relevant checks rather than rereading the entire file.
- Two identical failures trigger root-cause investigation and a changed approach.

## 2. Prefer the smallest sufficient change
Check native configuration, standard library and existing helpers before adding code.
Keep validation, authentication, error handling and data-integrity guards intact.
Avoid speculative abstractions and dependencies.

## 3. Start with 1-hop; expand on evidence
Before changing shared behavior, inspect its direct imports/references:
```bash
bash <skill_dir>/scripts/dep-graph.sh src/checkout.ts publishCheckout
```
The helper finds textual candidates, not a resolved dependency or call graph.
A small result does not prove a small blast radius.

Expand selectively when evidence names a changed contract, event consumer, DI registration,
shared schema, cross-module invariant or failing test—even if the language signature is unchanged:
```bash
bash <skill_dir>/scripts/dep-graph.sh src/publish.ts --signal checkout.ready --limit 40 --max-bytes 5000
```
Verify returned candidates; inspect the relevant neighbor's signatures and at most one additional hop first.
Record the expansion reason in the checkpoint; reassess if evidence requires further investigation.
Deduplicate references and keep a bounded main-context digest; a limit is a loading boundary, not permission to miss a required consumer.
The helper reports skipped files and truncation; narrow searches or inspect omitted candidates locally before making completeness claims.
Hub changes require checking actual affected contracts, not a fixed caller-count safety assumption.

## 4. Memory: admission, evidence and retention
`memory/` represents current state, not an append-only history.

| File | Role | Default budget |
|---|---|---|
| `MEMORY_INDEX.md` | Derived stack/commands/invariant summary and topic pointers | 60 lines |
| `ACTIVE_STATE.md` | Current objective, touched files, pending checks and last verified sync | 30 lines AND 2048 UTF-8 bytes |
| `topics/*.md` | Durable domain facts, loaded only for the task's domain | 4096 bytes/file; 16384 bytes combined |

Byte limits are storage/context guardrails, not measured token savings.
Override topic limits with `memory/.memory-budget.json`, e.g. `{"topic_bytes":8192,"topics_total_bytes":32768}`.
Only those two positive integer keys are supported.

**Admission gate:** retain a fact when it is confirmed, reusable and costly or risky to rediscover.
Good candidates: architectural constraints, public contracts, verified commands and non-trivial bug causes.
Raw logs, guesses, duplicate narratives and completed step lists do not belong in durable topics.
Keep unconfirmed hypotheses and immediate progress in `ACTIVE_STATE.md`, explicitly pending.
The index is a derived summary; source-backed topic facts remain authoritative.

**Required checkpoint field:** ``- **Last Synced Commit**: `<checked-commit-or-UNSYNCED>` ``.
Preserve this field's Markdown shape; leave its value unchanged while verification is pending.

**Required durable fact shape:** one Markdown bullet per fact, source file(s) and the last checked commit:
```markdown
- [Request] --(tenant isolation)--> [Guard] | source: `src/auth/tenant.ts` | verified: `a1b2c3d`
- [Producer] --(cents payload)--> [Worker] | source: `src/publish.ts`, `src/worker.ts` | verified: `a1b2c3d` | state: review
```
Use actual project-relative regular file paths; commits must exist in that repository.
A source diff invalidates confidence, not automatically the fact: inspect the change and revalidate.
A source rename/deletion requires replacing its reference or confirming the fact obsolete.
For pending revalidation, retain the last confirmed commit and mark `state: review`.
A supplied commit hash or a successful structural check is not evidence that semantic checks passed.

**Retention order:** replace contradicted facts; remove proven obsolete facts and exact duplicates;
move task-only notes to the checkpoint; condense remaining facts while preserving meaning and evidence.
Preserve security, data-integrity and cross-module invariants.
Age or budget pressure alone does not justify deleting useful knowledge.
If valid facts cannot fit, report the unresolved overflow or justify a configured budget increase.
Do not create an archive that is automatically loaded back into context.

## 5. Synchronize with honest checkpoints
At session start, read the index/checkpoint once and run:
```bash
bash <skill_dir>/scripts/sync-memory.sh [project_dir]
```
Inspect changed sources and lazy-load only relevant topics; update facts in place.
After code/schema/config changes, update the checkpoint and affected topic facts before handoff.
Then run:
```bash
python3 <skill_dir>/scripts/memory-health.py [project_dir]
```
The check is read-only: budgets, missing/unsafe sources, changed/untracked sources,
missing/unavailable provenance, exact duplicate fact text and pending review.
Exit 0 = checks passed; 1 = review required; 2 = invalid config/invocation/check failure.
The report counts all findings before capping displayed detail.

Stamp only after reviewing affected facts, running relevant semantic tests, and passing structural checks:
```bash
bash <skill_dir>/scripts/sync-memory.sh [project_dir] --stamp
```
Stamping refuses dirty sources and failed health checks; it does not run application tests for you.
Never advance Last Synced Commit while checks are pending, failed, or only claimed by supplied evidence.
Do not force an application commit merely to satisfy this skill: leave the checkpoint pending and report what remains.
Without Git history, modification times are hints and freshness remains explicitly unverified.

## 6. Cache stability and measurement
Keep stable instructions separate from changing task state where the host permits.
Provider caching is outside the skill's control; do not promise a cache-hit rate or savings percentage.

Benchmark using whole matched sessions, not a handpicked command:
- Same task, fixture revision, exact model/configuration, tools and acceptance tests.
- Fresh sessions; include skill loading, exploration, retries, memory writes/checks and compaction overhead.
- Compare no skill vs v2.3 and v2.2 vs v2.3 separately; test cold/warm cache regimes separately.
- Capture provider-reported input, cached input and output; cached input is part of input.
- Report cumulative tokens and peak observed request input separately; peak input is a context proxy, not exact occupancy.
- Require both runs to pass acceptance checks; record failures, never discard them to improve results.
- Prefer at least five randomized/alternating matched repetitions per task; report median/range and failed-run counts.
- Report dollars only from explicitly supplied rates; reasoning is not added again to output.
- If subagents are used, include their usage too; a parent-only trace cannot measure total delegated work.
Use `python3 <skill_dir>/scripts/usage-report.py --help` and the benchmark instructions in README.md.
The comparator accepts agent-neutral normalized usage; capture-api adapts final OpenAI, Anthropic and Gemini
responses, while capture-codex is an optional host-specific adapter; unsupported host logs need explicit normalization.
Benchmark each agent/model/configuration separately; different model tokenizers are not interchangeable units.
Keep raw traces local: they may contain project content or credentials.
