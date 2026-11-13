# LACC Bash-Free Runtime 4.0 — native acceptance matrix

**Gate state:** OPEN / NOT CERTIFIED. This file is an executable validation
protocol, **not** evidence that results passed. Use the exact same reviewed
Git commit SHA on each native host. Do not enable hosted CI/GitHub Actions.

## 1. Source freeze and minimum runtime

On each Windows, Linux and macOS host use an isolated clean checkout
of the final candidate commit, and record Git SHA, OS release, filesystem
type, Node, Python (if present), npm and Git versions. No Docker Linux
result counts as native macOS; WSL does not count as native Windows.

PowerShell:

\`\`\`powershell
git fetch origin
git switch <candidate-branch>
git pull --ff-only origin <candidate-branch>
git status --porcelain=v1
git rev-parse HEAD
node --version
git --version
node --test tests/test_bash_free_context_slice.mjs
node --test tests/test_bash_free_reference_signatures.mjs
node --test tests/test_bash_free_init_sync.mjs
node --test tests/test_bash_free_installer_contract.mjs
node --test tests/test_bash_free_security.mjs
node tests/run_consolidated.mjs --bash-free
# When network access is explicitly approved, produce installer evidence:
node tests/run_consolidated.mjs --bash-free --installer
\`\`\`

POSIX sh/zsh:

\`\`\`sh
git fetch origin
git switch <candidate-branch>
git pull --ff-only origin <candidate-branch>
git status --porcelain=v1
git rev-parse HEAD
node --version
git --version
node --test tests/test_bash_free_context_slice.mjs
node --test tests/test_bash_free_reference_signatures.mjs
node --test tests/test_bash_free_init_sync.mjs
node --test tests/test_bash_free_installer_contract.mjs
node --test tests/test_bash_free_security.mjs
node tests/run_consolidated.mjs --bash-free
\`\`\`

Use Node **22.20+** for installer validation and Node 24 LTS when
available. A Node 22.16 smoke test is not installer acceptance. Node
\`--bash-free\` runs all Node suites, including Node/Python parity when
available, but explicitly leaves the historical Python unittest suite
unverified; it never calls Bash for the main Node workflows.

## 2. Historical parity without obligatory Bash

Legacy POSIX Bash wrappers remain for existing user workflows. They
still require mandatory dedicated validation on native Linux/macOS.
On Windows with a blocked \`bash.exe\`, tests targeting those optional
wrappers should report **SKIP**, never FAIL-as-code-defect or PASS.

On a machine where Bash is permitted:

\`\`\`sh
bash -c 'printf LACC_BASH_OK'
python3 -m unittest discover -s tests -v
node tests/run_consolidated.mjs
\`\`\`

The native BF-4 harness probes actual Bash execution, not mere PATH
presence. Inspect skipped counts and root causes. Record an explicit
legacy parity verdict for each entry point: \`init-memory.sh\`,
\`sync-memory.sh\`, \`dep-graph.sh\`, \`ast-skeleton.sh\`,
\`ctx-slice.sh\`. The Node equivalents may differ deliberately:
reference-scan refuses sensitive source targets and marks unavailable
inventory incomplete; signatures requires Python 3.9+ for exact
\`ast.parse\` and labels heuristic-only outputs otherwise; ctx-slice
uses stricter byte/line caps with hard errors rather than unbounded
output. Any other discrepancy requires explicit review.

## 3. Opt-in installer smoke (BF-5)

A corporate HTTP 407 from npm is **proxy-auth prerequisite UNVERIFIED**,
not a failed LACC installer. This is distinct from E401/E403 registry
access, DNS/timeouts and untrusted TLS chains, which are also classified
as prerequisites rather than falsely PASS. No automatic credential
extraction, authentication bypass or TLS verification disablement.

When an approved enterprise proxy blocks npm, first inspect the
configuration **without network access**:

```powershell
node tests/install_smoke.mjs --proxy-diagnostics
```

This command lists only the names of configured proxy environment
variables, the presence of proxy/registry keys in project/user npmrc,
and whether Windows resolves a system proxy through manual/PAC/WPAD
configuration. It does not output proxy URLs, registry URLs, passwords,
authorization tokens or private npmrc values, and performs no registry
request. `windows_system_matches_explicit_proxy: no` means the
effective Windows proxy differs from an explicit HTTP(S) proxy
environment variable; it does NOT establish that npm can authenticate.
This inspection does not yet cover npm global/built-in config or
authenticated proxy negotiation.

When an approved enterprise proxy blocks npm, test the skill payload
and agent bridges offline with no registry access:

```powershell
node tests/install_smoke.mjs --offline-local
```

This local-copy fixture validates exact files, Node entrypoints and
native Codex/Claude/Gemini/Roo bridges, **not the external skills
installer**; it must never be used as BF-5 official installer PASS.

On Windows, an optional (explicit) system-proxy lookup resolves the
current user's effective proxy for the npm registry, including PAC/WPAD
where Windows supports it, and passes its address to the isolated npm
child process without changing npmrc or global machine settings:

```powershell
node tests/install_smoke.mjs --copy-only --windows-system-proxy
node tests/install_smoke.mjs --windows-system-proxy
```

This uses Windows PowerShell/.NET only for discovery (no Bash or
`shell: true`). Existing explicit `HTTPS_PROXY`, `HTTP_PROXY` and
npm proxy environment settings take precedence in the standard
`--windows-system-proxy` mode.

**When diagnostics explicitly show a mismatch**, operators may instead
opt in to an isolated override:

```powershell
node tests/install_smoke.mjs --copy-only --prefer-windows-system-proxy
```

This mode resolves the effective Windows proxy even when environment
variables already exist and temporarily passes `npm_config_proxy`,
`npm_config_https_proxy`, `HTTP_PROXY`, and `HTTPS_PROXY` to the **one
npm child process only**. It preserves `NO_PROXY`, the selected npm
registry, and all TLS/trust options; it never edits `.npmrc` or exports
Windows credentials. The Windows proxy URL is never printed. Failure to
discover a safe HTTP(S) proxy returns UNVERIFIED, not a fallback to a
conflicting proxy. This option is not an auth bypass: persistent E407
requires a company-approved NTLM/Kerberos solution or IT-managed npm
registry endpoint. Do not change `strict-ssl` to bypass TLS. Do not embed corporate passwords in code/URLs, copy logs
containing credentials, or set `strict-ssl=false`.

Only after network consent and a trusted local source checkout:

\`\`\`sh
node tests/install_smoke.mjs --copy-only
node tests/install_smoke.mjs
\`\`\`

This uses the pinned \`skills@1.7.4\` package in an isolated temporary
project; no global agent changes. It checks byte-for-byte installed
skill files, Codex/Claude/Gemini/Roo native instruction bridges,
idempotent init preserving user notes, read, health, and the new Node
exploration commands. Copy mode is mandatory; symlink mode is validated
where the OS privileges permit it, otherwise recorded UNVERIFIED.
No Bash/Python required. The retained original Python installer is a
separate optional legacy compatibility check.

Record package version, actual network policy, temporary log path,
whether each agent installation was verified, the checksum of all
installed files if retained, and all skips. Never upload raw secrets
or user memory; review/redact local logs before sharing.

## 4. Security and negative acceptance (BF-6)

- Project traversal, symlinked source, symlinked memory topic,
  renamed source, invalid Git metadata, Git assume-unchanged,
  dirty/staged/untracked Git, unavailable revision: fail closed.
- Path names with spaces, Unicode, CRLF, tabs, brackets and Git rename
  metadata: preserve source paths and line numbers without terminal
  control escapes or shell command injection.
- Sensitive broad-scan candidates (.env*, private keys, credentials):
  never echo their contents; incomplete coverage must be disclosed.
- Untrusted source files must not be executed by signature extraction.
  A Python AST subprocess imports only the bundled stdlib script,
  not the analyzed project module.
- Existing memory facts/instructions must survive bootstrap, re-init,
  failed checks and optional installer verification unchanged.
- Stamping only after reviewed, clean evidence and health checks;
  no automatic semantic truth assignment or raw secret disclosure.
- Context slicing defaults to no persistent logs; \`--keep\` is explicit
  and private. Interrupted/failed retention cleans temporary data.
- All external processes use argument arrays, never \`shell: true\`.
  No network in core runtime or bundled unit tests.

## 5. Matrix to fill with real results

| Evidence | Windows native | Linux native | macOS native |
|---|---|---|---|
| Node 22.20+ version and Git | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Native BF-2a/2b/2c/5/6 Node suites | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Node/Python parity where Python present | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Native core report at exact SHA | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Legacy POSIX Bash tests | SKIP if unavailable | UNVERIFIED | UNVERIFIED |
| Installer smoke copy/link | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Path/symlink/privacy negative tests | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Real Codex answer and bridge loaded | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Real Claude answer and bridge loaded | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Real Gemini answer and bridge loaded | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Real Roo answer and bridge loaded | UNVERIFIED | UNVERIFIED | UNVERIFIED |

Preserve report JSON and sanitized per-test logs, and aggregate native
results via \`tests/aggregate_consolidated.mjs\` only after mapping legacy
skip policy and installed runtime evidence. Existing RD-5/CR-5
aggregation never independently proves host delivery.

## 6. Aggregate the five native evidence reports

For BF-7 specifically, the original RD-5 aggregator is kept unchanged.
The Bash-free aggregator requires three core+installer reports (one per
native OS), plus two full Python/Bash legacy reports (native Linux and
macOS). All five must use the **same exact Git SHA** and branch. This
avoids requiring POSIX Bash on Windows while preserving legacy parity
requirements on platforms that actually support it:

```sh
node tests/aggregate_bash_free.mjs \
  --windows ./validation/windows-core.json \
  --linux ./validation/linux-core.json \
  --macos ./validation/macos-core.json \
  --linux-legacy ./validation/linux-full.json \
  --macos-legacy ./validation/macos-full.json
```

Copy only reviewed/redacted report JSON files from the local per-host
validation folder. The aggregator rejects symlinks, oversized/malformed
files, mismatched commits/branches, skipped Node tests, missing
installers and skipped POSIX Python tests. Even if the five reports
say PASS, the output is only
`REPORTED_PASS_PENDING_INDEPENDENT_REVIEW`; its release gate remains
`NOT_PASSED` until independent host-answer checks and owner approval.

## 7. Release/deprecation decision

**Do not delete the five shell wrappers or declare the 4.0 migration
released** before:
1. Native Windows/Linux/macOS results on the same SHA, no unexplained
   failures or test skips, and Git/source security review.
2. Identified legacy API differences either resolved or documented
   as intentional private/safety hardening; user workflows reverified.
3. Successful, opt-in installation smoke and agent-specific real answer
   acceptance (actual emitted response, not just CLI diagnostics).
4. README/ROADMAP/CHANGELOG correctly describe supported commands,
   prerequisites and unsupported AST/semantic behaviors.
5. A rollback plan for users who still invoke .sh and explicit owner
   approval to promote \`develop\` to \`main\`.

A successful Node test from one OS, or a green Python legacy subset
with skips, cannot substitute for these requirements.
