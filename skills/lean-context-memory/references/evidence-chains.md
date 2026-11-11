# CR-2 — Evidence-backed memory impact chains

**State:** experimental code on develop; behavioral regression tests are
authored but NOT EXECUTED. No feature is published to main until validation.

CR-2 extends the opt-in CR-1 `--explain --json` result for directly
changed sources and indirect static dependency impacts.

```powershell
node <skill_dir>/scripts/lacc.mjs search . --query "auth policy" --deps --explain --json
node <skill_dir>/scripts/lacc.mjs session-check . --deps --explain --json
node <skill_dir>/scripts/lacc.mjs dependency-impact . --explain --json
node <skill_dir>/scripts/lacc.mjs health . --explain --json
node <skill_dir>/scripts/lacc.mjs doctor . --explain --json
```

CR-2 does **not** introduce a new Git verifier, external tool, network
request, daemon, source editor or semantic code interpreter. It carries
the exact file-level edges already gathered in RD-2/RD-3 and the result
of the existing Git source check to the CR-1 explanation formatter.

## Additional diagnostic field

For relevant findings, `diagnostics[].evidence.trace` now contains:

- `status`: `direct-git-evidence`, `static-dependency-evidence`,
  `partial` or `unavailable`.
- `baseline_commit`: the fact's recorded, checked Git revision, when
  available. Each hop has the **resolved full revision** from its
  RD-1 graph edge. The current HEAD is **null** unless actual trusted
  evidence already supplies it; this formatter does not call Git.
- `changed_file` and `change_reason`: only from an existing
  `verifySources` result such as `changed-source`.
- `hops[]`: **dependency → dependent** sequence containing
  `relationship` (`import`, `project-reference`, `configuration`),
  `adapter`, `adapter_version`, `language`, `confidence`,
  `baseline_commit`, `evidence_source`.
- `fact_link`: the final cited source, memory topic location and
  verified revision.
- `limitations[]` and `semantics: "not-evaluated"`: a full static
  path is not proof the remembered assertion actually changed.
- `explanation`: a short evidence-based explanation, not the claim
  text or a semantic verdict.

Illustrative trace for a JS/TS dependency:

```json
{
  "status": "static-dependency-evidence",
  "evidence_origin": "existing-lacc-git-and-static-dependency-analysis",
  "baseline_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "current_commit": null,
  "changed_file": "src/permissions.ts",
  "change_reason": "changed-source",
  "hops": [{
    "dependency": "src/permissions.ts",
    "dependent": "src/auth.ts",
    "relationship": "import",
    "adapter": "js-ts-static",
    "adapter_version": "2",
    "language": "typescript",
    "confidence": "heuristic",
    "baseline_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "evidence_source": "src/auth.ts"
  }],
  "fact_link": {
    "cited_source": "src/auth.ts",
    "memory_location": "memory/topics/architecture.md:2",
    "baseline_commit": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "relation": "cites-source"
  },
  "limitations": [
    "file-level-links-do-not-prove-symbol-or-runtime-dependency"
  ],
  "semantics": "not-evaluated"
}
```

Trace is versioned through the parent CR-1 schema and uses additive
fields. The existing `finding_id` stays stable: adding per-hop metadata
does not change existing deduplication identities. CR-2 is only emitted
with `--explain`. Without that flag, the dependency-impact issues retain
their existing shape (no `evidence_edges`), preventing token inflation.

## Integrity rules

- Hop order must match the reported dependency path; the changed
  dependency is first and the memory-cited source last.
- Every hop must be a valid RD-1 edge: exact `from`/`to`,
  adapter ID and version, relation kind, confidence, evidence source,
  and full revision consistent with the fact's checked commit.
- A missing, contradictory, unsafe or suspicious edge leads to
  `status: "partial"` and a specific limitation, **not** an invented
  connection. Paths, adapters, metadata and Git status codes are
  validated and length-limited; no raw code or fact text is copied.
- The existing output budget may omit diagnostics when space is
  exhausted, marking truncation. Do not interpret absent output as
  proof of absence of staleness.
- Source status and static import edges remain evidence of *potential*
  staleness. They do not establish symbol dependency, actual runtime
  behavior, or a confirmed semantic contradiction.

## Explicitly outside CR-2

- Resolving arbitrary .NET symbols, Composer runtime autoload,
  CS-Cart hooks, Python runtime imports, generated clients and
  non-static dependencies. These remain incomplete in RD-3/4.
- General whole-repository graph indexing, long-term provenance cache
  and semantic consistency checks.
- Automatic user notifications or proof a user saw this diagnostic
  (CR-3), persistent acknowledgments (CR-4), release validation (CR-5).

## Acceptance (not yet executed)

`tests/test_memory_evidence_chains.mjs` adds direct drift, real Git
reverse edges, per-hop adapter versions, provenance consistency,
incorrect/reordered/sensitive paths, absent Git reason, downstream
search/session reporting and legacy output compatibility.
Run these together with the RD-1/RD-2/RD-3/CR-1 regression suites on
Windows and Linux only in the later consolidated develop gate.
