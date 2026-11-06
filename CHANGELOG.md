# Changes

## Unreleased — Git verification and agent diagnostics

- Verify historical source blobs and staged index modes in bounded Git batches,
  while still hashing every distinct worktree source through `git hash-object --path`.
- Preserve checks for staged-only changes, literal Git pathspecs, and source
  modifications hidden by `assume-unchanged`; no automatic fact promotion.
- Provide read-only `memory-health.py --json` with complete structured findings
  and unchanged exit codes.
- Add local regression coverage for multi-revision facts, large source batches,
  permission-only staged changes and JSON diagnostics. No hosted CI changes.

## Unreleased — safety and memory correctness

- Use a shared provenance/fact parser across health and maintenance, preserving fenced examples and inline shell pipes.
- Protect task checkpoints from oversized indexes; validate topic pointers and add an index byte cap.
- Exclude common secrets from broad dependency scans, constrain signature extraction to local safe files, and use accurate source line numbers.
- Stream sliced logs without temporary disk writes by default; `--keep` explicitly retains a private stdin log.
- Respect explicit native agent targets and symlinked auto-discovery; make UTF-8 bootstrap and checkpoint writes byte-stable on Windows.
- Preserve topic file modes and CRLF during reviewed memory maintenance; provide Python interpreter fallback for Bash wrappers.
- Add regression tests for security, provenance parsing, state protection and portability. No CI workflow or runner changes.


## v2.4 — review-driven improvements

- Rename the catalog to LACC (Lean Agent Capabilities Collection), with independent skill
  names and installation commands using vzubcu/LACC. Document project/global source rebinding.

- Secure temporary stdin logs, validate limits and clean up on normal exit/SIGTERM.
- Bound content scans as well as output; preserve source directories and prioritize qualified imports.
- Repair declaration extraction and state clearly where it is heuristic.
- Initialize empty topics, use Claude's native import, and distinguish unchanged bootstrap artifacts.
- Keep default sync advisory and inexpensive; retain strict health/stamp modes.
- Separate optional disk limits from bounded recall output.
- Add digest-bound previews for within-topic exact deduplication and selected-fact revalidation.
- Check actual normalized source content even when Git index flags hide changes; recheck before evidence writes.
- Reject corrupted UTF-8 rather than silently changing recalled text.
- Shorten daily instructions while keeping optional benchmarking tooling inside lean-context-memory.
- Add read-only context-pressure monitoring with configurable checkpoint/compact thresholds; it never invokes host compaction automatically.

Compatibility: rerun initialization after upgrading; shell gates should use sync --strict.
Configured legacy disk caps still apply. Existing facts/checkpoints are preserved. Benchmark tooling
remains optional inside lean-context-memory. No hooks or measured token-saving percentage are supplied.
