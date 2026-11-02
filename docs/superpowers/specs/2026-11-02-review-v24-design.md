# Review-driven v2.4 design

The user approved implementing the reviewed improvements. Preserve the portable
Markdown/Bash/Python/Git core; ship a reviewable PR, without claiming measured savings.

## Approach

Repair helpers and simplify the existing workflow. A complete memory server with
embeddings would change installation and dependency costs; hooks before a stable
core would multiply platform behavior. Both remain deferred. No native memory is
disabled or silently migrated; the project chooses one canonical store of facts.

## Deliverables

- Secure stdin slicing: private random temporary files, automatic cleanup, explicit
  opt-in retention, positive line limits; bounded signature extraction, accurately
  described as heuristic rather than AST parsing.
- Dependency candidates prioritize path-qualified imports, then explicit symbols
  and signals. Do not infer dependencies from a generic bare filename stem. Preserve
  nested source folders such as src/memory and src/build. Report exclusions and
  enforce file/byte scan limits in addition to display limits.
- Bootstrap creates empty annotated topics rather than invalid example facts. Keep
  the checkpoint UNSYNCED. Use a short common protocol and a real @AGENTS.md Claude
  import. Fingerprint only newly created instruction files to distinguish unchanged
  bootstrap artifacts from application drift; later user edits still count.
- Default sync is a compact advisory Git drift report, without a full health scan;
  --strict retains a nonzero review gate, and --stamp retains full health validation.
- Disk storage caps become optional; legacy configured caps remain enforced. A
  separate load_bytes budget (8192 default) limits memory-read.py output, including
  index/checkpoint/topic headers and truncation notice. No silent truncation or deletion.
- memory-maintain.py compact previews exact duplicate record removal only. Revalidate
  accepts explicit topic/line selections and --reviewed, refuses uncommitted sources,
  and updates their checked commit only after acknowledgement. Both write commands
  require --apply and the digest from the preview; reject changed or unsafe inputs.
  Semantic condensation remains an agent-reviewed diff preserving evidence/invariants.
- Reduce SKILL.md to the daily recipe; move detail into references. Keep existing
  usage tools and benchmark documentation inside lean-context-memory as optional tooling,
  with no execution dependency from the daily memory workflow.

## Validation

Run real temporary-project regression tests for every reported failure, stale preview
rejection, symlink/escape protection, conservative stamp behavior, configured budgets,
bounded UTF-8 output and both installer modes for every catalog skill. Run a fresh
agent application scenario and an independent branch review. Measure bytes/words
only as artifact size; real token savings require separate matched model runs.
