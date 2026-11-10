# Maintaining LACC

LACC means Lean Agent Capabilities Collection: portable skills for AI agents. Skills may
cover different languages and domains; each catalog entry must state its actual requirements
and supported operations. Keep planned skills separate from available entries. Use stable,
domain-specific skill names, independent of the repository's brand.

Keep each distributable skill under `skills/<unique-name>/`. Its SKILL.md frontmatter
must contain the matching `name` and a clear `description`. Keep runtime scripts,
templates and documentation used by the skill inside that directory, using relative
paths. Do not depend on files elsewhere in this repository at runtime.

Treat [ROADMAP.md](ROADMAP.md) as the current prioritized product plan,
not a release declaration. Distinguish code existence, local tests, real-agent
pilot checks and independently measured usage results. Link new feature PRs
to a roadmap milestone and revise the status only after evidence-backed
acceptance criteria are satisfied. Do not confuse historical
`docs/superpowers/plans/` implementation plans with current roadmap.

Keep tests and contributor/design documentation outside distributable directories.
Do not add a root SKILL.md: installers may stop discovery at that file and hide the catalog.
Add each new skill to the root README catalog and provide installation/behavior tests
appropriate to its requirements. Do not copy existing skill resources into another directory
just to create a second installation format.

Run the Node runtime tests from the repository root, without Bash or Python:

```bash
node --test tests/test_node_runtime.mjs
```

If native Windows tests appear hung, run a single test or enable subprocess
diagnostics. The test harness uses a 15-second Git subprocess timeout and a
30-second Node CLI subprocess timeout; production Git checks are also bounded
to 30 seconds and disable interactive credential prompts.

```powershell
node --test --test-reporter=spec --test-name-pattern="init, idempotence" tests/test_node_runtime.mjs
$env:LACC_TEST_DEBUG="1"
node tests/test_node_runtime.mjs
Remove-Item Env:LACC_TEST_DEBUG
```

A `Git command timed out` or `Subprocess failed` result indicates an
environment problem or a tool defect requiring inspection, **not** a passing
test. Capture the last printed command, exit status and stderr; do not run
GitHub Actions to resolve the issue.

These tests create disposable local Git repositories. They test the
Node-only core and do not require a service, WSL or cloud runners.
Windows-native tests still need independent execution on a Windows host.

The previously skipped Windows case now locates the real `git.exe` and tests
Node recall with only its directory on PATH (no Python/Bash directories).
The Node suite also verifies that an unavailable Git executable **cannot**
produce a trusted memory fact.

Optional parity test (Python 3.9+; no Bash/WSL required):

```bash
node --test tests/test_node_python_parity.mjs
```

This executes the **same disposable Git fixtures** with Node and Python checkers
and compares trust/review outcomes for clean, modified, staged, hidden,
missing/unavailable sources, pending reviews, keyed conflicts, invalid
provenance and UTF-8 read budgets. The Python-dependent test is skipped if
no supported Python interpreter exists; install and execute locally (or use
a Linux development container) before claiming full parity. Set
`LACC_PYTHON` to an interpreter path when discovery fails. Diagnostic reason
labels differ for some invalid metadata; trust decisions must not.

Run from the repository root:

```bash
python3 -m unittest discover -s tests -v
python3 tests/install_smoke.py
```

The smoke test needs Node.js 22.20+, npm, Git, Bash and Python 3.9+, and network access
to fetch `skills@1.7.4` if uncached. It installs the local catalog into disposable project
directories, never into your global agent directories. It checks both symlink and copy
installs for Codex, Claude Code, Gemini CLI and Roo, compares all shipped files, and
initializes project memory through the installed helpers. It does not run those agent clients.
CI also installs the exact commit from the current GitHub repository URL, so renamed-source
discovery and package download are checked as well as local installation.

To upgrade the CI installer, change its pin in tests/install_smoke.py and this contributor guide together,
run the checks, and review any CLI behavior changes. Keep provider versions, measurements
and token-saving claims separate from installer compatibility.

The skill now bundles `scripts/lacc.mjs` plus `lacc-core.mjs`, using Node.js
22+ built-ins for cross-platform core memory operations. Python/Bash remain
optional for advanced, nonported helpers. The installed skill must not
depend on repository-root test files. The `npx skills` installer is distinct
from the bundled `node` CLI; no `npx lacc` package is published.
A manual fallback is to copy the entire `skills/<name>/` directory into the agent's skills directory.

Before releasing a path migration, document old and new paths and rerun initialization
against an existing fixture to check that user memory and unrelated instructions survive.

## Renaming the repository

The catalog title and individual skill names are independent of the GitHub repository name.
The current source is `vzubcu/LACC`; use that shorthand in installation examples and links.
Keep installed names such as lean-context-memory stable when changing the catalog URL.
Rename the existing repository in GitHub settings, then update installation examples and
repository references together. Do not replace working source URLs with a proposed destination
before that destination exists. Test installation from the new shorthand before promoting it.

GitHub redirects existing repository traffic and Git clone/fetch/push operations after a rename;
see [GitHub's rename guidance](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository).
Existing installer lock metadata may still name the old source. Test updates for both install
scopes; if rebinding is needed, reinstall from the new source into the same scope/agents.
Preserve customizations and project memory. Do not recreate the old repository name while
depending on its redirect, because doing so removes that redirect.
