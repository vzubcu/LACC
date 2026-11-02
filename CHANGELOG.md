# Changes

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

Compatibility: rerun initialization after upgrading; shell gates should use sync --strict.
Configured legacy disk caps still apply. Existing facts/checkpoints are preserved. Benchmark tooling
remains optional inside lean-context-memory. No hooks or measured token-saving percentage are supplied.
