# Project Memory Index (Tier 1 - Hot Memory)
> **CRUD RULE**: Max 60 lines. Use terse key-values & graph edges (`[A] -> [B]`). Overwrite outdated facts in-place.

## Stack & Quiet Commands
- **Stack**: [Auto-populate on init: e.g., TS / Next.js / NestJS / PHP Laravel / .NET / PostgreSQL]
- **Typecheck / Lint (Quiet)**: [e.g., `npx tsc --noEmit`, `php -l <file>`, `dotnet build -v q`]
- **Test Single File (Quiet)**: [e.g., `npx jest <path> --silent --bail`]

## High-Impact Hub Nodes (Check 1-Hop Callers Before Editing)
- `[path/to/core-file]` -> Used by `[ModuleA, ModuleB, ModuleC]` (High blast radius)

## Core Architectural Invariants
- [Rule 1: e.g., `[Controller] -> [Service] -> [Repository]`; no direct DB access in controllers]
- [Rule 2: e.g., Validate all DTOs at boundary before service layer]

## Critical Gotchas (1-Liners)
- `[Issue/Symptom]` -> `[Exact Fix / Rule]`

## Tier 2 Topic Pointers (Lazy-Load ONLY When Task Matches Domain)
- `memory/ACTIVE_STATE.md` -> Current task progress, git sync hash & active 1-hop subgraph
- `memory/topics/architecture.md` -> Module topology graph, boundaries & dependency edges
- `memory/topics/db-and-api.md` -> Entity relational graph, migrations & API contracts
- `memory/topics/gotchas.md` -> Resolved non-trivial bugs & environment quirks
