# Memory conflict reporting and user-visible transparency

**Status:** CR-1–CR-4 diagnostics, evidence, host guidance and grouped task-scoped UX authored on develop (validation pending); CR-5 remains acceptance design. **Target branch:** develop.
**Reviewed:** 2026-11-11.
**Roadmap milestone:** P1 — Explainable memory trust & conflict reporting.
**Community feedback:** When remembered information and current code disagree,
which wins, and will the agent tell the user what it noticed?

## CR-1 implementation boundary

The opt-in Node CLI `--explain --json` normalization is implemented in
`lacc-findings.mjs` and added to `search`, `health`, `doctor`,
`session-check` and `dependency-impact`. It maps existing source,
checkpoint, conflict and RD-2 import-impact issues to stable IDs,
bounded evidence-oriented findings and suggested review actions,
**without running another Git check or changing default trusted recall**.

See [actual CLI schema](../../skills/lean-context-memory/references/findings.md).
The originally proposed JSON below is conceptual and not an exact live
payload: for example, current_commit is `null` when this layer lacks
verified HEAD evidence. Output fields are additive and opt-in.
No automatic user notification, semantic contradiction proof,
cross-host delivery tracking or autonomous memory correction exists.
RD-3 now supplies optional, heuristic `.NET`, PHP/Composer and Python
static dependency edges in addition to JS/TS; their unresolved
compiler/framework/runtime semantics are expressly marked incomplete.
Written tests await the consolidated develop acceptance gate.

## CR-2 implementation boundary

The opt-in `--explain --json` result now includes
`evidence.trace` for affected sources/dependencies. It carries the
checked fact Git baseline, the reason from the existing source
verifier and exact RD-1 edge provenance for each static dependency
hop (adapter, version, relationship, language, confidence, revision).
It terminates at the cited-source → memory-fact link. Inconsistent or
unavailable evidence becomes `partial` instead of being inferred.

See the [actual evidence chain contract](../../skills/lean-context-memory/references/evidence-chains.md).
No additional Git verification or user-delivery guarantee is
introduced. The sample design JSON below predates this live trace.

## CR-3 implementation boundary

The read-only `disclosure-contract` CLI command describes Codex,
Claude, Gemini and Roo instruction bridges with no claimed delivery
confirmation. Explicit `--explain --json` output includes bounded
`disclosure_protocol` guidance, **not** a host event. `lacc init`
generates task-relevance-aware rules in marked AGENTS.md blocks
and refers to them from native instruction files.

This is instruction only: no UI callbacks, delivery receipts,
acknowledgment logs or guarantee a host loaded the rules.
Previously installed projects must rerun `init` to refresh the
marked block. No user-facing message is sent automatically.

See [CR-3 disclosure contract](../../skills/lean-context-memory/references/disclosure.md).
CR-4 may reduce repeated prompts; actual host integrations require
separate evidence before claiming delivery.

## CR-4 implementation boundary

The opt-in, read-only `disclosure-summary --task ID` aggregates
CR-1/2 findings from the bounded session check by changed/cited source
with brief/detail and optional dependency modes. It preserves
unresolved totals and incomplete/truncated status. The explicit write
`disclosure-mark-seen --task ID --id FINDING --expect-head SHA` stores
only task-, Git HEAD- and evidence-bound **agent-seen** bookmarks
in a private ignored directory, with at most seven-day validity.
No bookmark changes fact trust, suppresses warnings or establishes
that the user saw a message. No user notification is sent.

See [CR-4 disclosure UX](../../skills/lean-context-memory/references/disclosure-ux.md).
It does not replace verified host-level delivery receipts, source
revalidation, nor real token/cost measurement; the same Git fact
evaluator remains authoritative for finding generation.

## Decision policy (source priority is not a semantic oracle)

1. **Fresh, checked code and tests are primary evidence** for describing
   current project behavior. A historical memory note never overrides
   verified current code by itself.
2. A file changed since `verified` means **possible staleness**, not
   necessarily a semantic contradiction. Never label a mere hash mismatch
   "contradiction" without reviewing the statement and implementation.
3. If direct/indirect evidence is changed, unavailable, incomplete or
   contradictory, place the relevant fact in `review-required`. Default
   trusted retrieval already filters directly stale facts; adapt the
   existing `search`, `health`, `doctor` and `session-check` output rather
   than creating an unrelated trust system.
4. If an agent can substantiate the current code's behavior, describe it
   with the checked file/commit and disclose the stale memory note.
   If the evidence cannot be resolved, explicitly say the outcome is
   **unverified**, rather than choosing a side or silently writing memory.
5. Never silently update `verified`, mutate a confirmed fact, delete a
   historical claim, or promote handoff content merely because of a
   mismatch. Corrections use an existing human-reviewed CAS/migration
   workflow and source re-check.

## Reporting contract

A bounded, local, machine-readable **finding** should include:

```json
{
  "schema": 1,
  "finding_id": "<stable-hash-not-personal-data>",
  "kind": "source-drift",
  "severity": "review",
  "fact": {
    "key": "auth.policy",
    "location": "memory/topics/architecture.md",
    "verified_commit": "<git-commit>"
  },
  "evidence": {
    "cited_sources": ["src/auth.ts"],
    "changed_paths": ["src/auth.ts"],
    "current_commit": "<git-head>",
    "dependency_chain": [],
    "verification_scope": "direct-git-provenance"
  },
  "trust": "review-required",
  "reason": "The cited source changed since the fact was verified",
  "recommended_action": "Inspect current code/tests; review and reverify memory",
  "coverage": {
    "complete": true,
    "limitations": []
  }
}
```

This is a **proposed contract**, not the current CLI JSON schema.
Use stable finding IDs to deduplicate repeated warnings. Add exact file
paths and revision evidence only when verified; redact secrets and limit
untrusted text size. For indirect dependencies, include a bounded path
`dependency -> dependent -> cited fact` with adapter/version/coverage;
for semantic disagreement require actual checked behavioral evidence.

Suggested finding kinds:
- `source-drift`: explicitly cited file changed;
- `indirect-dependency-drift`: linked imported source changed;
- `evidence-unavailable`: commit/file/reader missing;
- `coverage-incomplete`: unresolved import, budget, unsupported language;
- `potential-fact-conflict`: keyed or textual overlap requiring review;
- `confirmed-semantic-conflict`: **only after evidence-backed** inspection;
- `stale-checkpoint`: task/session baseline differs.

Keep `status` separate from `kind` and `severity`. Incomplete coverage
must never imply "no conflict".

## How agents communicate it

A CLI cannot guarantee a proactive notification in every host.
Implement a **structured output + instruction bridge**, not an
unsupported universal UI notification claim.

- On a material finding before an answer, the agent should explicitly
  say it detected a possible memory/code mismatch, summarize the
  source/reason, and state whether it verified the current behavior.
- Provide a short default summary; the agent can show more technical
  evidence on request. Avoid repeating the same warning on every turn
  by grouping/deduplicating by finding ID and scope.
- No intrusive notification for low-confidence, irrelevant findings.
  Never silently omit a material unresolved finding when it affects the
  user's requested task.
- In noninteractive hosts, return machine-readable findings and an
  exit/status signal; no claim that the user necessarily saw an alert.
- Agent instruction templates and documentation must distinguish
  `reported to agent`, `agent instructed to surface` and
  `user actually notified`; only an observed host event can confirm
  the latter.

Example explanation (human-readable):

> LACC detected a possible mismatch: the remembered permission rule
> was verified against src/auth.ts at commit X, but that source changed.
> The note was excluded from trusted recall. I will inspect the current
> implementation before relying on the old rule.

An indirect dependency report must say which language/resolver and what
coverage it had. It may not claim "the code contradicts memory" based on
file movement alone.

## Work packages

**CR-1 — unify diagnostics:** map current `search`/`health`/
`doctor`/`session-check` findings into one stable, bounded schema.
Avoid duplicate Git verification. Define severity, completeness and
redaction policy, with backward compatible CLI outputs.

**CR-2 — source-to-fact explanation:** emit direct and, once supported,
reverse dependency paths with checked commit(s), incomplete coverage
and actionable revalidation suggestions.

**CR-3 — agent surfacing contract:** update `SKILL.md` and generated
native instruction bridges for Codex/Claude/Gemini/Roo. Document
limitations of host-specific notifications and optional hooks.

**CR-4 — consistency/UX:** deduplicate repetitive messages, group
related facts, offer short and detailed modes, keep deterministic
ordering, limit output bytes/token overhead.

**CR-5 — local acceptance:** create fixtures for:
- Direct cited-file drift while a memory note remains unchanged.
- Unchanged source importing changed dependency (including unknown
  language and incomplete resolver coverage).
- File changed without actual semantic contradiction.
- Two mutually inconsistent facts with a shared key.
- Git unavailable, erased source, incomplete scan, partial index.
- Current behavior independently checked and explicitly described,
  but previous memory not auto-rewritten.
- No false "user notified" when only CLI output was produced.
- Redaction of secrets and bounded outputs on Windows and Linux.

## Integration and priority

The RD-1 language-neutral graph contract supplies dependency evidence.
This conflict-reporting layer owns its presentation and trust vocabulary.
Both should share one provenance evaluator. Do not build CR by making
the language-specific adapters responsible for UI notifications.

**Current milestone:** CR-1–CR-4 code and regression fixtures are
in develop, **not tested**. CR-5 cross-host/cross-platform acceptance
and verified delivery integrations remain separate work. Keep stable main unchanged until the
complete develop gate passes.

**Explicitly unimplemented:** semantic conflict proof, universal
host notifications, cross-language source-to-fact reverse graph and
automatic memory repair. The `--explain` CLI flag does **not** notify users.
