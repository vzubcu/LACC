# CR-1 — Unified, explainable LACC memory findings

**Status:** implemented on develop; functional validation pending.
**Scope:** Node.js 22+ CLI output only. No automatic notifications or semantic
conflict adjudication. Stable main is unchanged until release validation.

## How to request normalized diagnostics

All commands keep their previous default output. Explicitly opt in to
the same diagnostic schema:

```powershell
node <skill_dir>/scripts/lacc.mjs search . --query "auth policy" --json --explain
node <skill_dir>/scripts/lacc.mjs search . --query "auth policy" --deps --json --explain
node <skill_dir>/scripts/lacc.mjs health . --json --explain
node <skill_dir>/scripts/lacc.mjs doctor . --json --explain
node <skill_dir>/scripts/lacc.mjs session-check . --json --explain
node <skill_dir>/scripts/lacc.mjs dependency-impact . --json --explain
```

With `--explain` the original JSON fields remain available and these
additional top-level fields are returned:

- `diagnostic_schema: 1` — additive output format marker.
- `diagnostics_total` — normalized unique findings observed inside the
  bounded input window (not proof that the entire project was scanned).
- `diagnostics[]` — sorted, deduplicated, bounded explanation records.
- `diagnostics_truncated` — some records could not be emitted because
  of the item count or output byte budget.
- `diagnostics_input_incomplete` — the normalization input exceeded its
  2000-diagnostic cap.
- `notification: "agent-output-only"` — **not** a user notification.
- `note` — explicit warning about evidence vs. semantic truth.

```json
{
  "schema": 1,
  "finding_id": "<24-char stable hash>",
  "kind": "indirect-dependency-drift",
  "severity": "review",
  "fact": {
    "key": "auth.policy",
    "location": "memory/topics/architecture.md:2",
    "verified_commit": "<checked-commit>"
  },
  "evidence": {
    "cited_sources": ["src/auth.ts"],
    "changed_paths": ["src/permissions.ts"],
    "current_commit": null,
    "dependency_chain": ["src/permissions.ts", "src/auth.ts"],
    "verification_scope": "experimental-js-ts-static-imports"
  },
  "trust": "review-required",
  "reason": "An imported dependency changed; the cited file may be indirectly affected.",
  "recommended_action": "Inspect the dependency chain and current behavior before relying on the fact.",
  "coverage": {
    "complete": true,
    "limitations": [],
    "note": "Complete means only this finding is classified; no semantic or repository-wide verification."
  },
  "disclosure": "reported-to-agent-only"
}
```

**Note:** the JSON above is illustrative. The `finding_id` is
deterministically derived from the diagnostic code, affected fact
location, source/revision and dependency chain; it does **not** include
the remembered claim text. Duplicate issues share an ID. IDs are not
authentication tokens or proof of semantic equivalence.

`current_commit` is null unless actual current-commit evidence was
already available to this normalizer. It does **not** trigger a new Git
scan. Other fields are bounded, redact obviously sensitive strings and
do not copy the raw remembered claim or untrusted diagnostic prose.

## Mapping and safety

The shared normalizer lives in
`scripts/lacc-findings.mjs` and consumes **existing** source
verification, conflict, import-impact and checkpoint findings.
It does not create a second Git provenance checker.

- `changed-source` / `direct-source-changed` → `source-drift`.
- `dependency-changed` → `indirect-dependency-drift`.
- `missing-source`, `untracked-source`, unavailable Git commit → `evidence-unavailable`.
- `dependency-coverage-incomplete`, budget/invalid notes → `coverage-incomplete`.
- `potential-conflict` / duplicate records → `potential-fact-conflict`.
- `committed-drift` / checkpoint issues → `stale-checkpoint`.

**A changed hash is not proof of an actual semantic contradiction**.
The normalizer never reports `confirmed-semantic-conflict` on its own,
never changes `state`, `verified` or memory files, and never silently
promotes a fact. Unknown diagnostic kinds fall back to review-required
rather than a false clean state.

The existing trusted recall behavior is preserved: `search` without
`--include-review` continues excluding untrusted candidates. With
`--explain`, reasons for excluded matched candidates may still be
shown in `diagnostics[]` without restoring those facts to trusted results.
This does not guarantee reporting unrelated or unscanned facts.

Output is bounded by existing `--max-bytes` / project memory budgets,
including normalized diagnostics. No entire file contents or raw
credential values should be copied into diagnostics; privacy redaction
is best-effort and must be tested with adversarial data.

`coverage.complete` describes whether **this diagnostic could be
classified**; it is never certification of a complete project scan
or the underlying memory claim. Source-to-fact dependency-chain coverage remains limited
to the bounded static JS/TS and RD-3 .NET/PHP/Python adapters.
For indirect findings, `verification_scope` identifies the adapter
(`experimental-js-ts-static-imports`, `experimental-dotnet-static`,
`experimental-php-static` or `experimental-python-static`) when
available. It is not proof of semantic or complete project analysis.

## CR-2 — provenance chain trace (develop only; not validated)

With opt-in `--explain --json`, source-drift and indirect-dependency
findings can include `diagnostics[].evidence.trace`. The bounded trace
contains checked `baseline_commit`, `changed_file`,
`change_reason`, validated `hops[]` (relation, adapter/version,
language, confidence, Git revision), plus `fact_link`.
If source/edge evidence is missing or inconsistent, the trace is
`partial` with a limitation rather than an invented path.

The formatter does not execute Git commands, examine source text or
claim the user saw this output. `current_commit` remains null unless
trusted upstream evidence actually exists. Finding IDs remain stable,
and expanded per-hop metadata is collected only under `--explain`.
See [CR-2 evidence chains](evidence-chains.md).

## CR-3 — agent disclosure guidance (develop only; validation pending)

CR-1 `--explain --json` reports gain a small top-level
`disclosure_protocol` instruction for the agent to assess task
relevance before reporting material uncertainty.
`status: agent-guidance-only` and `user_delivery: not-observed`
mean that no host delivery event was observed.
`candidates_before_output_budget` is not a number of messages
delivered; the output byte budget may truncate diagnostics.

`node lacc.mjs disclosure-contract` lists the instruction bridges
for Codex/Claude/Gemini/Roo. Finding IDs, the legacy field
`disclosure: reported-to-agent-only` and output without
`--explain` are unchanged. No host notification API, delivery
receipt or user acknowledgment store exists. See the
[agent disclosure protocol](disclosure.md).

## What is explicitly not implemented (CR-4–CR-5)

- No arbitrary-symbol dependency proof, semantic LSP/compiler
  comparison or independently validated runtime behavior (RD-4).
- No guaranteed user-facing notifications, host hooks, popup, email
  or confirmation that any user saw a warning (future host integration).
- No durable cross-session warning acknowledgment/deduplication store
  or advanced explanation UI (CR-4). IDs support only current result
  deduplication; no secret persistent log is created.
- No completed multi-host, Windows/Linux, privacy or end-to-end
  acceptance gate (CR-5). Regression cases are authored, not executed.

Agents may choose to explain relevant findings in their natural
language response, but `reported-to-agent-only` does not prove that
happened. See the design:
[Memory conflict transparency](../../docs/architecture/memory-conflict-reporting.md).
