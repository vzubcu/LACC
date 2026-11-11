# Memory conflict reporting and user-visible transparency

**Status:** design only, not implemented. **Target branch:** develop.
**Reviewed:** 2026-11-11.
**Roadmap milestone:** P1 — Explainable memory trust & conflict reporting.
**Community feedback:** When remembered information and current code disagree,
which wins, and will the agent tell the user what it noticed?

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

**First implementation candidate:** CR-1, because current direct-Git
diagnostics can be normalized even before RD-2 supports reverse
dependency traversal. Keep the existing stable main behavior unchanged
until the develop validation gate passes.

**Explicitly unimplemented:** semantic conflict proof, universal
host notifications, source-to-fact reverse graph and automatic memory
repair. This document does not add any runtime commands.
