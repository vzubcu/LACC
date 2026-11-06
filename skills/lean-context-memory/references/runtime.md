# LACC v3.2 — Universal runtime selection

LACC is a skill plus optional local helper tools. Installing its SKILL.md does not install or guarantee a runtime. **Never claim a check ran unless its tool actually ran.**

## Use available capabilities, not assumptions

| Environment | Mode | Allowed guarantees |
|---|---|---|
| Node.js 22+ + Git | Node CLI (preferred on Windows) | Initialize, read, search, source-backed health/doctor, sync and reviewed checkpoint stamping |
| Python 3.9+ + Bash + Git | Legacy Python/Bash | Existing fully featured helpers, including selective revalidation and compact preview/apply |
| Python 3.9+ + Git but no Bash | Python CLI subset | read, search, health, doctor, context and benchmark tools; shell scripts unavailable |
| Agent file tools + Git, no Node/Python/Bash | Native agent fallback | Read files, check history and edit instructions manually, mark results unverified until independent checks |
| No executable Git | Degraded/Unverified | Read memory and search only as *unverified* lower-trust notes; no verified provenance claims or stamping |

To discover actual tool support when Node exists:

```
node <skill_dir>/scripts/lacc.mjs capabilities
```

## Node.js CLI — zero npm package dependencies

Use Node.js directly, not `npx lacc` (there is **no published package** called LACC configured by this repository):

```
node <skill_dir>/scripts/lacc.mjs init . --agent claude
node <skill_dir>/scripts/lacc.mjs sync .
node <skill_dir>/scripts/lacc.mjs read .
node <skill_dir>/scripts/lacc.mjs search . --query "tenant isolation" --json
node <skill_dir>/scripts/lacc.mjs health . --json
node <skill_dir>/scripts/lacc.mjs doctor . --json
```

There is no WSL, Bash, Python, provider API, Docker, daemon or network access requirement for these commands; **Git is required to establish trusted evidence**. The Node implementation uses only Node.js builtins and local files, and does not install extra dependencies. Node is required **at invocation time**, not just at installation time.

Read-only commands: capabilities, read, search, health, doctor and sync (without `--stamp`). `init` writes agent bridges and missing templates but does not replace existing facts. `sync --stamp` is a write operation guarded by Git and health checks; agents must review semantics and tests before invoking it. No auto-promotion of stale or conflicting facts. `--json` enables structured output on search, health and doctor. `read --topic name.md` and `--max-bytes` remain bounded.

Native Node does **not** yet implement the Python maintenance transaction machinery (`memory-maintain.py compact/revalidate`), AST signatures, dependency-graph discovery or private log slicing. If those are needed, use the existing Python/Bash scripts when available or use native editor tools for a carefully reviewed change; do **not** claim identical automated safety from an improvised fallback. Detailed benchmark adapters also remain Python-only.

## If there is no Node.js either

Use the host's available file read/search/edit and Git tools when available. Manually load `memory/ACTIVE_STATE.md` and `memory/MEMORY_INDEX.md`, inspect only relevant topic facts and their source files, and keep the agent's active task state up to date. Without Git verification, treat every recalled fact as **unverified**. Never invent a checked commit, suppress pending review or silently mark memory healthy. Explain the unavailable automated capabilities and ask for approval before installing dependencies. The Markdown skill remains useful, but does not magically execute portable code.

## Local-only validation

```
node --test tests/test_node_runtime.mjs
```

Node tests create isolated temporary Git repositories and do not require Bash or Python. Windows and Linux parity should be validated on a real Windows workstation and at least one Linux runtime. No GitHub Actions workflows or runners are added. See also the existing Python suite for regression parity. Results from helper tests cannot establish token savings.
