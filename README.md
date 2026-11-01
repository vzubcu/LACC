# `lean-context-memory` (v2.2 — Auto-Bootstrap, Graphify & Auto-Sync Edition)

**Evolution of `smart-project-memory`** — An always-on AI Coding Agent skill combining:
0. **Zero-Touch Auto-Bootstrap (`init-memory.sh`)**: Automatically creates `memory/`, injects the enforcement block into `AGENTS.md` (and `CLAUDE.md`), and triggers an immediate project scan to populate `MEMORY_INDEX.md` without placeholders.
1. **Caveman Protocol**: Zero-fluff, telegraphic responses (saves output + future input tokens).
2. **Ponytail Decision Ladder**: Strict YAGNI anti-over-engineering hierarchy (Native -> StdLib -> Existing -> Minimal Code).
3. **Graphify Protocol (1-Hop Topology & Edge Compression)**: Replaces multi-turn "grep hopping" and verbose architectural prose with 1-hop blast-radius checks (`dep-graph.sh`), subgraph boundaries, and directed triplet notation (`[A] -> [B]`).
4. **RTK & 60/40 Middle-Out Truncation**: Quiet terminal execution + head/tail log slicing (`ctx-slice.sh`).
5. **Context Mode (>5KB Ceiling) & Forked Research**: Keeps large payloads out of the main context window and isolates multi-file exploration in sub-agents.
6. **Surgical Codebase Operations**: Skeleton-first AST reading (`ast-skeleton.sh`), targeted patches, no full-file re-reads after edits, parallel tool batching, and 2-Strike Fail-Fast loop protection.
7. **KV-Cache Prefix Stability**: Protects ~90% prompt cache hit rates.
8. **Auto-Syncing Two-Tiered CRUD + Graph Memory (`sync-memory.sh`)**: Tracks git drift (`Last Synced Commit` + working tree status) and enforces a mandatory **Definition-of-Done Gate** so any code change automatically updates `memory/`.

---

## Directory Structure

```text
lean-context-memory/
├── SKILL.md                        # Core ultra-dense agent skill instructions (Protocols 0-8)
├── README.md                       # Setup, auto-init & auto-sync guide
├── scripts/
│   ├── init-memory.sh              # Auto-creates `memory/` AND injects rules into `AGENTS.md` / `CLAUDE.md`
│   ├── sync-memory.sh              # NEW: Detects git drift since last memory update & stamps synced commit
│   ├── dep-graph.sh                # Graphify: 1-hop Inbound/Outbound dependency & blast-radius mapper
│   ├── ast-skeleton.sh             # Fast signature/AST extractor before reading large files
│   └── ctx-slice.sh                # 60/40 middle-out log/command truncation helper
└── templates/
    ├── MEMORY_INDEX.md             # Tier 1 Hot Memory template + High-Impact Hub Nodes (<=60 lines)
    ├── ACTIVE_STATE.md             # Session handoff + Last Synced Commit + Active 1-Hop Subgraph (<2KB)
    └── topics/
        ├── architecture.md         # Tier 2 Directed Module Topology Graph
        ├── db-and-api.md           # Tier 2 ER Graph & API Contract Edges
        └── gotchas.md              # Tier 2 Resolved bug 1-liners
```

---

## How Initialization & Auto-Sync Work

### 1. One-Prompt Initialization
Once the skill is in your skills folder (`.claude/skills/lean-context-memory`, `.agents/skills/lean-context-memory`, or `.roo/skills/lean-context-memory`), simply tell your agent:
> *"Inițializează skill-ul `lean-context-memory` în acest proiect."*

The agent will automatically:
1. Run `scripts/init-memory.sh` to create `memory/` and inject the persistent protocol block into `AGENTS.md` (and `CLAUDE.md` if present).
2. Scan your project manifests (`package.json`, `composer.json`, `*.csproj`, `pubspec.yaml`, etc.) and populate `memory/MEMORY_INDEX.md` and `memory/topics/*.md` with your real stack and graph topology.
3. Stamp the current git commit hash in `memory/ACTIVE_STATE.md`.

### 2. Automatic Memory Renewal on Code Changes
- **During the same agent session**: The injected `AGENTS.md` + `SKILL.md` enforce a **Definition-of-Done Gate** — the agent cannot finish a coding/refactoring turn without updating `ACTIVE_STATE.md` (and `MEMORY_INDEX.md` / `topics/*.md` if architecture, DB, APIs, or gotchas changed).
- **Across different agents or manual edits**: At session start, `scripts/sync-memory.sh` compares `Last Synced Commit` in `ACTIVE_STATE.md` with the current git working tree and recent commits, showing the agent the exact files modified since memory was last updated.
