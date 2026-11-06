---
name: lean-context-memory
description: Use when project memory is stale, repeated discovery is wasting context, a context handoff is needed, or the user requests compact persistent project memory.
---

# Lean Context Memory v2.4

Maintain a small working context with source-backed facts. Use Bash, Git and Python 3.9+;
ripgrep is optional. Use the host agent's normal tools.

## Daily recipe

1. Reuse the project's chosen fact store. If none exists, initialize once:
   `bash <skill_dir>/scripts/init-memory.sh . --agent auto`.
   Explicit targets: `codex`, `claude`, `gemini`, `roo`, `all`. Existing memory is preserved.
2. Run `bash <skill_dir>/scripts/sync-memory.sh .` for a short advisory drift report.
   Read the hot index/checkpoint once with `python3 <skill_dir>/scripts/memory-read.py .`.
   Load only relevant topics: `python3 <skill_dir>/scripts/memory-read.py . --topic architecture.md`.
   A truncation notice means narrow the read or inspect specific local ranges.
3. When the host exposes current/main-request input tokens and the exact active-model context window,
   run `python3 <skill_dir>/scripts/context-pressure.py --input-tokens N --context-window W`.
   At 70% refresh ACTIVE_STATE; at 80% checkpoint then recommend the host-native context compact;
   at 90% avoid substantial new exploration until checkpoint + compaction. Do not infer missing
   usage/window values and never invoke compaction automatically. After host compaction, reload hot memory.
4. Before changing shared behavior, search direct references:
   `bash <skill_dir>/scripts/dep-graph.sh src/checkout.ts publishCheckout`.
   Expand using a named event/contract: append `--signal checkout.ready`.
   Read candidate code and tests to verify coupling; inspect additional consumers when evidence requires it.
5. Keep current work and hypotheses in `memory/ACTIVE_STATE.md`. Retain confirmed reusable
   contracts, commands, invariants and root causes in topics. Each durable fact is a plain bullet:

   ```markdown
   - Tests run with npm test | source: `package.json` | verified: `a1b2c3d`
   ```

   Use actual source paths and the commit checked. A source change requests review; it does not prove the fact false.
   Keep unresolved facts marked `| state: review`; preserve their previous checked commit.
6. At handoff, update affected facts and run `python3 <skill_dir>/scripts/memory-health.py .`.
   Preserve the checkpoint field exactly: ``- **Last Synced Commit**: `<commit-or-UNSYNCED>` ``.
   After semantic checks, use `bash <skill_dir>/scripts/sync-memory.sh . --stamp` only with clean sources.
   Pending checks leave the checkpoint unchanged.

## Maintenance on demand

- For stale facts, overflow, exact deduplication or batch revalidation, read [maintenance](references/maintenance.md).
- For initialization, upgrades, native instruction imports and Git/Windows limitations, read [setup](README.md).
- For bounded search, signature extraction and private log handling, read [exploration](references/exploration.md).
- For token measurement, read [benchmark protocol](references/benchmark.md) and use the bundled optional `scripts/usage-report.py`.

The default recall limit is 8192 UTF-8 bytes per read, including notices. Disk caps are optional.
The index remains at most 60 lines/4096 UTF-8 bytes; the checkpoint at most 30 lines/2048 bytes.
The default hot read prioritizes ACTIVE_STATE so oversized index content cannot hide it.
Keep useful evidence and security/data-integrity invariants when condensing; budget pressure alone does not justify deletion.
No automatically loaded archive. Bytes are guardrails; measured token savings require matched complete model runs.
