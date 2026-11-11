# CR-4 — Task-scoped disclosure summaries and agent-seen deduplication

**State:** authored on develop, full behavioral/security validation NOT RUN.
**Compatibility:** Node.js 22+, native Windows/Linux, no external npm
packages, network services, background workers or host-specific APIs.

CR-4 makes agent-facing warnings useful and economical without
automatically silencing information that requires source review.

## Commands

The existing CR-1/2/3 `--explain --json` reports are unchanged.
Use the new *opt-in* task-scoped presentation:

```powershell
node <skill_dir>/scripts/lacc.mjs disclosure-summary . --task auth_fix --json
node <skill_dir>/scripts/lacc.mjs disclosure-summary . --task auth_fix --deps --json --detail
node <skill_dir>/scripts/lacc.mjs disclosure-summary . --task auth_fix
```

The first invocation uses the bounded `session-check --explain`
diagnostics, without re-parsing memory with an independent evaluator.
`--deps` enables the same experimental JS/TS/.NET/PHP/Python static
dependency graph used in session-check. It is optional because the
extra source scans can be expensive and may be incomplete.

A summary groups all **emitted** findings by checked changed path
(or cited source/memory note fallback). It sorts groups with new
findings first, then by severity category and stable key.
Brief mode (default) contains group count, focus path, kinds,
up to three finding IDs and unseen vs previously marked counts.
`--detail` additionally includes bounded per-finding action,
classification and trace status. It never copies raw fact text.
The output remains bounded via the existing `--max-bytes` budget.

The JSON response includes:

- `status`: `review-required`, `incomplete` or `no-emitted-findings`;
  a lack of emitted findings is **not a whole-repository clean bill**.
- `total_findings`, `total_groups`, `results[]`, `new_findings`,
  `seen_markers` and `unresolved_findings`.
- `scan_incomplete` and `output_truncated`, independent of group counts.
- `input_report_bytes`: actual serialized input report size in bytes;
  **not** a claim of token or API cost savings. Compare with the
  returned summary bytes in later real-agent A/B measurements.
- `notification: "agent-output-only"`,
  `user_delivery: "not-observed"` — no host delivery receipt exists.

A lower `--limit` (1..10, default 6) limits the number of *groups*
returned; total counts and truncation remain visible. No acknowledged
finding is automatically deleted from the active problem set.

## Optional cross-session agent-seen marker

After an agent has **actually inspected** one of the currently
reported finding IDs, it may make this explicit write:

```powershell
node <skill_dir>/scripts/lacc.mjs disclosure-mark-seen . --task auth_fix --id <24-hex-finding-id> --expect-head <40-hex-Git-HEAD> --json
```

The marker is an **agent-seen bookmark**, not an approval, source
revalidation, user acknowledgement, user-visible delivery event,
semantic conflict resolution or permission to ignore the finding.
It is accepted only if the ID is still present in the current bounded
`session-check --explain` scan, and the expected Git HEAD matches.
If the ID came from a `--deps` scan, use `--deps` again for
`disclosure-mark-seen` so the same finding is observable.

Markers are written only on this explicit command under:

`memory/disclosures/<task>/<finding-id>-<git-head>-<evidence-digest>-<time-window>.json`

The directory is private and has a local `.gitignore` using the
existing LACC `privateStore` guard. No raw claims, code or human
conversation is persisted. The filename binds the marker to its
finding ID, Git HEAD and hashed evidence context; records contain
only these identifiers, a timestamp, task and
`user_delivery: "not-observed"`. Existing markers are immutable,
created exclusively, checked for tampering and re-used idempotently.
A new seven-day window permits a fresh explicit bookmark.

The read-only summary checks at most two matching time windows
per emitted finding without scanning the entire directory. Markers
are treated as valid for **at most seven days**, for the same task,
Git HEAD and evidence fingerprint; the active finding remains
`review-required` regardless. If HEAD or diagnostic evidence
changes, the prior marker is not re-used.

**Privacy/retention:** old marker files are not automatically deleted
(no worker or background cleanup exists). They must be treated as
local private metadata; manual deletion of
`memory/disclosures/<task>/` simply resets agent-seen counts.
The task ID may contain only lowercase letters/digits/underscore/
hyphen (up to 64 chars). No credentials, full URLs or task prose
should be used as task IDs.

## Why not automatically suppress acknowledged findings?

LACC cannot verify that the user saw a warning. It also cannot infer
that the code is now semantically correct from a hash or a saved
agent-seen bookmark. Silencing such a warning would be a false
safety signal. CR-4 therefore **groups** it, labels it as
previously seen by the agent and prioritizes newly observed
findings, but never changes the trust status or total unresolved
count. If a host wants to hide messages in its own UI, that host
must establish separate notification semantics and safeguards.

The current CLI also does not claim that a generated AGENTS.md rule
was loaded by Codex/Claude/Gemini/Roo. CR-3 remains the
host-neutral instruction contract; actual delivery proof would need
a verified host callback in a later release.

## Reuse and limits

- No independent Git/source validator: summaries consume the existing
  bounded `session-check` CR-1/2 diagnostic payload.
- No semantic fact auto-resolution or memory edits. Only
  `disclosure-mark-seen` writes advisory private metadata.
- No guaranteed host notification, delivery receipt, task relevance
  classifier or long-term user acknowledgment store.
- A summary may be incomplete because the session scan, optional
  dependency analysis, normalization or output budget is incomplete.
  Do not turn incomplete coverage into a success status.
- If Git is missing, summary can still report uncertainty but
  **cannot** reuse an agent-seen marker or create a verified one.
- Old user memories and tracked project sources are never rewritten.

## Validation gate — authored, not executed

`tests/test_disclosure_ux.mjs` covers deterministic source grouping,
brief vs detailed output, priority, stable IDs, task isolation,
read-only default behavior, opt-in idempotent private marker writes,
stale Git HEAD rejection, invalid paths/IDs, expiration, size
budgets, no-Git and no user-delivery assertions.

During consolidated develop validation, include Windows Git
behavior, path/symlink/race hardening, data retention, privacy,
test fixtures on multi-language repositories and real
agent-session token/cost A/B comparisons. Only publish measured
byte and token savings after the tests actually run.
