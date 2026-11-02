# Agent skills

Portable skills for coding agents, starting with **lean-context-memory v2.4**:
compact, source-backed project memory, bounded dependency exploration and measured token usage.

## Install

From your project directory, run:

```bash
npx skills add vzubcu/lean-context-memory-skill --skill lean-context-memory
```

Choose your agent in the installer. Node.js 22.20+ and Git are needed for installation.
The memory helpers also need Bash and Python 3.9+ (on Windows, use WSL or Git Bash).
No model-provider SDK is required. The examples use the installer's current stable version.

For a specific agent, without interactive prompts:

```bash
npx skills add vzubcu/lean-context-memory-skill --skill lean-context-memory --agent claude-code -y
```

Replace `claude-code` with `codex`, `gemini-cli` or `roo`; multiple agents can follow `--agent`.
Add `-g` to install across projects. Add `--copy` if your system does not support symlinks.
The default installs into the current project. Review the installer's destination summary.

Then ask your agent:

> Initialize lean-context-memory in this project using the installed skill, populate memory from verified sources, and report pending checks.

Installation makes the skill available; initialization creates the project's memory and instruction bridges.
It does not automatically certify memory, run a model, or establish token savings.

## Catalog

| Skill | Purpose | Guide |
|---|---|---|
| `lean-context-memory` | Source-backed memory, bounded recall, reviewed maintenance and exploration | [Setup and migration](skills/lean-context-memory/README.md) |
| `lean-context-usage` | Optional reported-token comparison; no API calls or SDKs | [Benchmark protocol](skills/lean-context-usage/references/benchmark.md) |

```bash
# Discover available skills without installing
npx skills add vzubcu/lean-context-memory-skill --list

# Update this skill (project scope)
npx skills update lean-context-memory -p -y
```

For a global installation, use `-g` instead of `-p`. After updating or moving an installation,
ask the agent to initialize it again: this refreshes helper paths and marked rules while preserving memory.
The command installs the current repository content. CI pins its installer version separately so validation remains reproducible.
For a reviewed snapshot, use a GitHub tree URL with a specific commit instead of the shorthand.
See the [installer reference](https://github.com/vercel-labs/skills/blob/main/docs/commands.md).

## Existing installations

v2.4 separates daily memory from benchmarking. Update memory and rerun initialization to
refresh marked rules and helper paths. For the optional measurement tools, install:

```bash
npx skills add vzubcu/lean-context-memory-skill --skill lean-context-usage
```

The old memory skill's `scripts/usage-report.py` path moves to the usage companion.
Default sync is advisory; use `--strict` for review gates. Storage caps are now opt-in,
and `memory-read.py` enforces a separate recall-output budget.

Skill sources now live in `skills/lean-context-memory/`. Existing installed copies continue to work.
If you run helpers directly from a clone, change `scripts/...` to
`skills/lean-context-memory/scripts/...` and rerun initialization to refresh stored paths.
Remove an older manually installed copy after verifying the replacement, so the agent does not load two copies.

## Maintain and extend

Each skill is self-contained under `skills/<name>/`, with one `SKILL.md` and its own resources.
There is no build step, generated duplicate, npm publishing credential or custom installer to maintain.
New skills can join the same catalog without changing existing install commands.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the layout and checks.
CI tests helper behavior and real CLI installation, including resource integrity and initialization.
Client behavior and actual token savings require separate end-to-end evaluation.
