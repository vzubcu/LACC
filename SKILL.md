---
name: lean-context-memory
description: Always-on token optimization, surgical context engineering, Graphify 1-hop topology & blast-radius analysis, YAGNI code minimalism, terminal output compression, KV-cache stability, and auto-syncing two-tiered CRUD project memory. Activate on ALL coding, debugging, codebase exploration, shell execution, refactoring, initialization, and architectural tasks.
---

# Lean Context & Memory Protocol (v2.2 — Auto-Bootstrap & Auto-Sync)

> **MANDATE**: Minimize input/output token burn, replace multi-turn file hopping with 1-hop graph topology, protect the context window from bloat, preserve prompt cache hits, and maintain a strictly auto-synchronized two-tiered CRUD + Graph project memory.

---

## 0. INITIALIZATION & AUTO-BOOTSTRAP PROTOCOL
When the user asks to **initialize**, **install**, or **set up** `lean-context-memory` in a project:
1. **Run Bootstrap Script**: Execute `bash <skill_dir>/scripts/init-memory.sh` in the project root. This automatically:
   - Creates `memory/MEMORY_INDEX.md`, `memory/ACTIVE_STATE.md`, and `memory/topics/*.md` if missing.
   - Injects the mandatory `lean-context-memory` enforcement & auto-sync block into `AGENTS.md` (and `CLAUDE.md` if present) idempotently.
2. **Auto-Scan & Populate (No Placeholders Left Behind)**: Immediately after running `init-memory.sh`, inspect project manifests (`package.json`, `composer.json`, `*.csproj`, `pubspec.yaml`, `docker-compose.yml`, directory tree) in a single batched command and **overwrite the template placeholders** in:
   - `memory/MEMORY_INDEX.md`: Fill in the exact Tech Stack, quiet lint/test/build commands, Core Architectural Invariants, and top 3-5 High-Impact Hub Nodes.
   - `memory/topics/architecture.md` & `db-and-api.md`: Populate initial directed graph edges (`[NodeA] -> [NodeB]`).
   - `memory/ACTIVE_STATE.md`: Record the current `git rev-parse --short HEAD` under `Last Synced Commit`.

---

## 1. CAVEMAN PROTOCOL (Zero-Fluff Output)
- **No Preamble / Postamble**: Never start with greetings, pleasantries ("Sure, I will..."), or closing summaries that repeat visible diffs/code.
- **No Step Narration**: Never narrate tool calls before or after execution ("Now I will read file X...", "I see that..."). Execute tools silently and output only conclusions or actions.
- **Telegraphic Responses**: Use terse bullet points. Answer direct questions in 1-5 lines whenever possible.
- **Sacred Exceptions (NEVER Compress)**: Keep code blocks, shell commands, file paths, API signatures, exact error messages, and critical security/data-loss warnings 100% intact and explicit.

---

## 2. PONYTAIL PROTOCOL (Anti-Over-Engineering & YAGNI Decision Ladder)
Before writing any code, traverse this ladder and **STOP at the first valid rung**:
1. **Native / Config**: Can the platform, runtime, browser, or config solve this natively?
2. **Standard Library**: Can the language's built-in standard library solve this without custom abstractions?
3. **Existing Codebase**: Does a helper, service, hook, or installed package already exist in this repo?
4. **Minimum Viable Code**: Write the smallest, flattest implementation that satisfies the explicit requirement.

- **Strict Bans**: No speculative abstractions, no single-implementation interfaces, no wrapper classes, no new files or third-party dependencies unless explicitly required.
- **Non-Negotiables**: Never cut input validation, auth/security checks, error handling, or data-integrity guards.

---

## 3. GRAPHIFY PROTOCOL (1-Hop Topology, Blast Radius & Edge Compression)
Stop multi-turn "grep hopping" across files. Treat the codebase as a directed graph of **Nodes** (files/classes/tables/endpoints) and **Edges** (`calls`, `imports`, `mutates`, `emits`):
- **1-Hop Blast-Radius Pre-Check**: Before changing any shared function, interface, DTO, or schema, extract its **1-hop neighborhood** (Outbound dependencies + Inbound callers) in a single command:
  ```bash
  bash <skill_dir>/scripts/dep-graph.sh <file_path> [symbol_name]
  ```
- **1-Hop Subgraph Loading Boundary**: Only inspect the target file and the **signatures** of its direct 1-hop neighbors. Never traverse 2+ hops into context unless a breaking contract change forces it.
- **Hub-Node Caution**: Files with high in-degree (>5 inbound callers) are **Hub Nodes**. Never alter their public signatures without explicit necessity; prefer internal edits or optional parameters.
- **Graph Triplet Notation in Memory**: Never write narrative prose to explain architecture or data flow. Store relationships strictly as directed triplets (`[NodeA] --(action/payload)--> [NodeB]`), saving ~65% tokens.

---

## 4. RTK & 60/40 TRUNCATION PROTOCOL (Terminal Noise Suppression)
- **Ban Raw Noisy Commands**: Never run unfiltered test suites, builds, logs, or full diffs.
- **Mandatory Quiet Flags**:
  - **Git**: `git status -s`, `git diff --stat`, `git diff -U2 <path>`, `git log --oneline -n 10`
  - **Tests/Builds**: Run only the target test file with quiet/bail flags (`--silent`, `--bail`, `--onlyFailures`, `-v q`) or pipe through `grep -E "FAIL|Error|Exception|●" -A 10`.
- **60/40 Middle-Out Truncation**: Never load >100 lines of command/log output into context. Keep the **first 60% (Head)** and **last 40% (Tail)**:
  ```bash
  bash <skill_dir>/scripts/ctx-slice.sh <file> 100
  ```

---

## 5. CONTEXT MODE & SUB-AGENT ISOLATION (>5KB Rule)
- **5KB Context Ceiling**: Tool outputs >5KB (large JSON payloads, DOM/Playwright snapshots, issue lists, CSVs, verbose logs) MUST NOT enter the main conversation context raw.
- **Scratchpad Redirect & Local Query**: Redirect large outputs to `/tmp/agent_ctx_$$.txt` and extract only required fields using `jq`, `rg`, `awk`, `sed`, or `sqlite3`.
- **Forked Research (Sub-Agent Delegation)**: When exploring >5 files or mapping an unfamiliar subsystem, DO NOT read all files in the main thread. Delegate exploration to an isolated sub-agent/task or one-shot script that returns **only a <=20-line technical digest + directed graph edges**.

---

## 6. SURGICAL CODEBASE OPERATIONS & EXECUTION DISCIPLINE
- **Step 1 — Locate & Map (`rg` + `dep-graph.sh`)**: Find exact symbol locations via `rg -n "pattern" <path>` and check 1-hop callers/callees.
- **Step 2 — Skeleton-First Read (AST/Signatures)**: For files >150 lines, NEVER read the whole file first. Extract structural signatures with line numbers:
  ```bash
  bash <skill_dir>/scripts/ast-skeleton.sh <file>
  ```
  Then read strictly the target line range (`+-25 lines`).
- **Step 3 — Targeted Patch & No Full Re-Read**: Apply surgical diffs/patches. **NEVER re-read the entire file after editing**. Verify edits strictly via `git diff -U2 <file>` or quiet syntax/type checks (`tsc --noEmit`, `php -l`, `dotnet build -v q`, `flutter analyze`).
- **Tool Batching & Codemode**: Batch independent reads/searches in a single turn (parallel tool calls or chained `&&` shell commands).
- **2-Strike Fail-Fast Rule**: If a fix or command fails twice consecutively with the same error, **STOP IMMEDIATELY**. Output a 3-line root-cause summary and pivot strategy or ask the user.

---

## 7. KV-CACHE PREFIX STABILITY (Prompt Cache Protection)
- **Immutable Prefix**: Keep system instructions, tool definitions, and initial context static throughout a task loop to preserve ~90% KV-cache hits.
- **Append-at-Tail Only**: Never inject volatile timestamps or mutate loaded system files mid-loop; append dynamic state updates strictly at the end of the conversation.

---

## 8. AUTO-SYNCING TWO-TIERED CRUD + GRAPH MEMORY (`memory/`)

Memory is an **Auto-Synchronized Current-State Database (CRUD)**, NEVER a static or append-only log.

### Architecture
1. **Tier 1 — `memory/MEMORY_INDEX.md` (Hot Memory | Max 60 Lines)**
   - Tech stack, quiet commands, Core Hub Nodes, architectural invariants, 1-liner gotchas, and Tier 2 pointers.
   - **Load Rule**: Read once at the start of non-trivial tasks.
2. **Tier 2 — `memory/topics/*.md` (Cold / Lazy Graph Memory)**
   - Domain-scoped files (`architecture.md`, `db-and-api.md`, `gotchas.md`) written as **Directed Graph Triplets** (`[A] -> [B]`).
   - **Load Rule**: Lazy-load ONLY the specific topic file matching the current task domain.
3. **Session Checkpoint & Sync Tracker — `memory/ACTIVE_STATE.md` (Max 30 Lines | <2KB)**
   - Tracks `Last Synced Commit`, Current Objective, Active 1-Hop Subgraph, Progress (`[x]`/`[ ]`), and Touched Files.

### AUTOMATIC MEMORY RENEWAL PROTOCOL (Mandatory Lifecycle Hooks)
1. **Session-Start Drift Detection (External Changes Check)**:
   - When starting a task, run `bash <skill_dir>/scripts/sync-memory.sh` (or compare `Last Synced Commit` in `ACTIVE_STATE.md` against `git status -s` / `git diff --name-status`).
   - If files were modified outside this session (by another agent or manually), inspect only the changed signatures/diffs and update the affected edges in `memory/` before proceeding.
2. **Post-Mutation Definition-of-Done Gate (Auto-Update on Code Changes)**:
   - **HARD RULE**: Any turn or task that modifies code (`edit`, `write`, schema migration, dependency change, or bug fix) is **INCOMPLETE** until memory is synchronized:
     - **Always update `memory/ACTIVE_STATE.md`**: Update `Touched Files`, `Progress`, `Active Subgraph`, and `Last Synced Commit`.
     - **Conditionally update `MEMORY_INDEX.md` / `topics/*.md`**:
       - New/changed route, controller, service, or module edge? -> Update `memory/topics/architecture.md` in-place.
       - New/changed table, column, DTO, or external API contract? -> Update `memory/topics/db-and-api.md` in-place.
       - Non-trivial bug root cause solved? -> Add 1-liner `[Symptom] -> [Cause] -> [Fix]` to `memory/topics/gotchas.md`.
       - New high-impact shared file or stack command? -> Update `memory/MEMORY_INDEX.md` in-place (enforcing <=60 lines).
