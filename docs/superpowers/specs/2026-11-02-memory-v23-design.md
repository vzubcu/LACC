# Lean Context Memory v2.3 Design
Approved scope: selection, evidence-based invalidation, bounded memory, adaptive dependency exploration, and a read-only health check.

## Intent and constraints
Preserve the Bash helpers and Markdown memory. Use Python 3 standard library for repeatable validation (already used by bootstrap); add no packages or background services. Memory is current state, not an accumulating session log. No automatic semantic deletion or claims of measured token/cache savings.

## Approach
Use explicit agent decisions plus deterministic local checks. Prompt-only changes cannot enforce budgets; a ranking/embedding service adds unjustified infrastructure. This is a repository update, not installation into a personal ChatGPT skill directory.

## Behavior
- Admit confirmed, reusable facts whose rediscovery matters; exclude raw logs, transient progress and guesses from durable topics.
- Store each durable fact as one bullet with `source: relative/path[, relative/path]; verified: <commit>`. Related sources share one entry. Use `state: review` for pending validation. Source edits trigger review, not deletion; source deletion/rename needs replacement or a justified obsolete decision.
- Preserve high-impact invariants. Prune proven obsolete entries and exact duplicates; age or a byte limit alone never authorizes deletion. If useful facts do not fit, report the remaining overflow or raise the configured budget with a reason.
- Keep index <=60 lines; active checkpoint <=30 lines and <=2048 UTF-8 bytes. Default each topic <=4096 bytes and all topic files together <=16384 bytes, configurable via `memory/.memory-budget.json`. These are byte budgets, not token counts.
- Add `python3 scripts/memory-health.py [project_dir]`: no writes, compact report; exit 0 healthy, 1 review required, 2 invalid invocation/config. Check budgets, malformed/missing fact provenance, unavailable verification commits, tracked/untracked source drift and missing sources, exact duplicate fact text. All detail is counted before display is capped; report omitted findings.
- Preserve 1-hop default. Permit evidence-triggered 2-hop lookup using named contracts/events, DI registrations, shared schemas or failed tests. Deduplicate matches and cap emitted refs/bytes; print coverage/truncation notices. No claim of a resolved call graph.
- Sync reports all changed-file counts and truncation, handles clean committed drift, dirty/untracked files and invalid checkpoints. Stamping never says memory is semantically verified.

## Acceptance
Renaming a referenced module causes a review finding until provenance is corrected and verified; indirect event consumers are locatable by an explicit second-hop signal; oversized topics are detected without deleting a safety invariant. Check nested paths, spaces, untracked files, invalid metadata/config, commits without a tree, binary/non-UTF8 memory and symlinks safely. All helpers run on small temporary Git fixtures. Validate bootstrap twice and preserve existing memory.

## Files
Update SKILL.md, README.md, scripts/init-memory.sh, scripts/sync-memory.sh, scripts/dep-graph.sh and Markdown templates; add scripts/memory-health.py and stdlib unittest integration tests.

## User-requested measurement extension
Add scripts/usage-report.py to import complete fresh single-agent Codex CLI token_count traces or compare normalized provider-usage rows. Match task/pair, fixture revision, exact model, config_id and cache regime. Report cumulative input/cache/output, observed peak input as a context proxy, paired median/range, optional measured duration and explicitly priced cost estimates. Cached input is already included in input; do not double-count reasoning. Block savings claims when either acceptance check fails/is unverified. Reject incomplete/reset traces and parent-only delegated usage. Do not claim a real A/B percentage from synthetic fixtures.

## Cross-agent requirement clarified by user
The memory core must run independently of Codex and model providers. Keep one common AGENTS.md protocol and thin native bridges for CLAUDE.md, GEMINI.md and .roo/rules/lean-context-memory.md, selected with --agent auto|codex|claude|gemini|roo|all. Preserve unrelated content, do not install clients, and validate unsafe destinations before writing. API usage adapters normalize final OpenAI Responses/Chat, Anthropic and Gemini response records into the shared schema; Codex session import remains optional. Use exact reported models, stable ids, duplicate detection, and provider-specific cache/reasoning accounting. Native client sessions and unsupported logs are not claimed to be tested or parsed; benchmark within each agent/configuration.
