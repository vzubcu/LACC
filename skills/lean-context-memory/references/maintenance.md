# Memory maintenance

## Budgets and facts

`memory/.memory-budget.json` is optional:

```json
{"load_bytes":8192,"topic_bytes":null,"topics_total_bytes":null}
```

Null storage caps mean unlimited topic storage on disk. Positive integer caps are opt-in;
legacy numeric caps remain enforced. load_bytes must be at least 512 and limits each
memory-read.py response, including path headers and notices. Override a read with a smaller
`--max-bytes`. Store large topics in separate domains and read selected ranges if truncated.
The index is capped at 60 lines/4096 UTF-8 bytes, and the checkpoint at
30 lines/2048 UTF-8 bytes. The default hot read prioritizes the checkpoint.

Durable bullets require source paths and an existing checked commit. Plain wording is sufficient:

```markdown
- Tests run with npm test | source: `package.json` | verified: `a1b2c3d`
- Worker consumes integer cents | source: `src/publish.ts`, `src/worker.ts` | verified: `a1b2c3d` | state: review
```

A durable fact can carry an optional stable key for explicit conflict review:

```markdown
- Tenant isolation is mandatory | source: `src/tenant.ts` | verified: `CHECKED_COMMIT` | key: security.tenant.isolation
```

Replace the placeholder commit with a real reviewed Git revision. The key must
be a lower-case dotted identifier with no whitespace, maximum 96 characters.
Existing unkeyed facts remain valid. Different assertions under the same key
are **potential conflicts requiring human review**; a source-unchanged hash
does not resolve them. Revalidation retains `key` while removing
`state: review` only after explicit `--reviewed` confirmation.

Headings and blockquotes provide contextual explanations; put commands inline in the supported
fact bullet. Pipes inside backtick-quoted inline commands do not split provenance fields.
Fenced Markdown examples are never parsed as facts. Ordinary unsupported prose is flagged by the strict health checker so unverified
assertions cannot masquerade as validated facts. Pending hypotheses belong in ACTIVE_STATE.md.

## Review selected stale facts

Inspect the source diff and run the relevant semantic checks first. This command is an explicit
acknowledgement of that review; it does not perform the review or run application tests:

```bash
python3 <skill_dir>/scripts/memory-maintain.py revalidate . --topic architecture.md --line 5 --line 8 --reviewed
```

The preview prints a diff and a `Plan: DIGEST`. Apply the same selection with:

```bash
python3 <skill_dir>/scripts/memory-maintain.py revalidate . --topic architecture.md --line 5 --line 8 --reviewed --apply --expect DIGEST
```

Only selected fact bullets are changed, their source files must be tracked and clean against HEAD,
and `state: review` is removed after acknowledgement. A changed preview, HEAD, unsafe path or
dirty source refuses the write. Recompute line selections after any edits.
Unreviewed facts keep their old commit and pending state; do not acknowledge them merely to clear warnings.

## Conversation context vs persisted-memory compaction

These are different operations. `context-pressure.py` observes host-reported request input and
recommends when to prepare for a host-native conversation compact. It never invokes that command.
Before compacting the conversation, refresh `memory/ACTIVE_STATE.md` with the current goal,
decisions, unresolved checks and next step; after compaction, reload the hot memory selection.

`memory-maintain.py compact` only removes exact duplicate persisted fact records with identical
evidence/state. It does not reduce the host conversation directly and must not be used as a substitute
for a context checkpoint. If exact usage or the model context window is unavailable, do not estimate a
pressure percentage from bytes, line counts or memory file size.

## Compact without losing evidence

```bash
python3 <skill_dir>/scripts/memory-maintain.py compact . --dry-run
python3 <skill_dir>/scripts/memory-maintain.py compact . --apply --expect DIGEST
```

The mechanical operation removes only exact duplicate fact records within each topic, with identical
evidence and state, retaining the first occurrence. Cross-topic consolidation needs a reviewed update
of topic/index pointers so facts remain discoverable. Records inside fenced examples are excluded. Different
provenance is never merged automatically. The preview digest binds the operation, selection,
topic contents and HEAD; changed inputs require a fresh preview.

For semantic condensation, review a normal text diff: replace contradicted facts, remove proven
obsolete notes, move task-only details to the checkpoint, and condense wording while preserving
meaning, provenance and invariants. The script intentionally cannot infer truth or semantic duplicates.
No budget or age rule authorizes losing a valid security/data-integrity invariant. Do not automatically
load an archive back into context. Run health and relevant tests before stamping the checkpoint.
