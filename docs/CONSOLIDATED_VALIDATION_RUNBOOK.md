# RD-5 / CR-5 — native, local validation runbook

**Status:** runner and aggregation scripts authored on develop; release gate
**NOT SATISFIED**. Running a command in one OS cannot certify another OS
or prove that an AI host displayed its answer. No GitHub Actions.

## 1. Freeze the exact commit

Use an isolated, **clean** checkout, Node.js 22+ and Git. Do not use
WSL as Windows acceptance, Docker Linux as macOS acceptance, or
a simulated `process.platform` as evidence.

On native Windows PowerShell, Linux terminal or macOS terminal:

```sh
git fetch origin
git switch develop
git pull --ff-only origin develop
git status --short
git rev-parse HEAD
node --version
git --version
node tests/run_consolidated.mjs
```

### PR #40 reconciliation (Bash-free integration candidate)

The Windows stabilization PR #40 included an optional
`bash_prerequisite` execution probe for its earlier Bash-based
installer workflow. BF-5 now replaces that installer with a Node-only
smoke test; **the integrated Node runner does not probe or launch Bash
by default**. Its historical classifier remains in a separate
regression module but does not make Bash a runtime prerequisite.
Legacy Python wrappers are still tested on POSIX hosts, and a denied
Windows Bash is explicitly unverified/skipped rather than PASS.
See [the BF-7 five-report gate](BASH_FREE_ACCEPTANCE_MATRIX.md).

For Node 22+ on Windows, the runner now explicitly requests
`--test-reporter=tap` and recognizes both TAP and spec summaries.
An exit status of 0 is **not sufficient** for PASS: missing/corrupt
summary, skipped/todo tests or zero tests are INCOMPLETE with
`status_reason` in `report.json`.

To inspect a failed suite in PowerShell, use the directory printed by
the runner (replace with the actual path from your run):

```powershell
$reportDir = Join-Path $env:TEMP "lacc-validation-EXAMPLE"
Get-Content (Join-Path $reportDir "report.json") -Raw
Get-Content (Join-Path $reportDir "test_dependency_graph_contract.mjs.log") -Tail 100
```

For sharing with a maintainer, review/redact private paths and text first.
Attach `report.json` and the **failed-suite** logs; summaries alone
cannot distinguish source regression from Git/Python/Windows fixture
configuration. The runner does not upload diagnostics.

The runner executes all discovered `tests/test_*.mjs` suites separately
with timeouts, then Python unit tests if Python 3.9+ is available.
It **does not** install Python, Git, npm packages or agent CLIs.
If optional Python parity is unavailable, report INCOMPLETE/UNVERIFIED.
No success can be inferred from a skipped test, missing Git, or failing
exit code. Captured TAP totals and exit codes are saved per suite.

The default writes `report.json`, `report.md` and bounded test logs
into a new directory under `os.tmpdir()`, **outside the repository**.
It refuses a dirty checkout. Reports can contain stack traces, private
workspace paths and environment information: **inspect/redact before
sharing publicly**. Do not commit raw reports or real agent transcripts.

For a deliberately **partial** Node-only check (not release acceptance):

```sh
node tests/run_consolidated.mjs --node-only
```

For **experimental BF-4 Bash-free Node core acceptance**, run:

```sh
node tests/run_consolidated.mjs --bash-free
```

This runs the Node suites (including optional Node/Python parity), reports
`node_core_status` separately and explicitly marks the old Python
`unittest` integration suite UNVERIFIED. Do **not** interpret a
`node_core_status: PASS` as release acceptance: legacy Bash tests and
real host/OS checks are still mandatory where appropriate.

For redacted corporate proxy diagnosis use
`node tests/install_smoke.mjs --proxy-diagnostics` first.
If the result is `windows_system_proxy: discovered` and
`windows_system_matches_explicit_proxy: no`, an approved
one-time test is
`node tests/install_smoke.mjs --copy-only --prefer-windows-system-proxy`.
It changes only the npm subprocess proxy environment and deliberately
keeps `NO_PROXY`, `registry`, and TLS settings. A remaining 407 is
still UNVERIFIED and may require enterprise proxy authentication. It
lists only configuration *key names*, distinguishes system proxy vs
explicit environment proxy when possible, inspects project/user npmrc
without printing values, and performs **no registry requests**.
Its findings cannot certify authentication, and npm global/built-in
configuration is not fully inspected.

If corporate npm egress returns HTTP 407, installer smoke now returns
`UNVERIFIED` (exit code 3; status reason
`optional-installer-prerequisite-unavailable`), without treating the
skill as broken. `node tests/install_smoke.mjs --offline-local` checks
local copies and agent runtime **without npm/network**, but is NOT
external installer acceptance. Windows users may opt in to
`node tests/install_smoke.mjs --copy-only --windows-system-proxy` to
resolve their effective Windows PAC/manual proxy for npm; NTLM/Kerberos
proxy authentication can still require administrator-approved tooling.
Do not weaken TLS verification or store proxy credentials in LACC.

For **experimental BF-5 installer smoke**, opt in separately. It may
download the pinned `skills@1.7.4` package through npm/npx and
requires Node 22.20+, npm/npx and approved network access; it does
**not** require Bash, WSL or Python. It tests copy installation first,
then symlink mode where supported, inside temporary projects:

```sh
node tests/run_consolidated.mjs --bash-free --installer
# Or standalone:
node tests/install_smoke.mjs --copy-only
```

The old `tests/install_smoke.py` remains historical POSIX acceptance
and is no longer the default optional installer entry point. Missing
Node/npm prerequisites return UNVERIFIED (exit 3), not PASS. Installer
smoke never grants permission for unrelated network requests. Do not
automatically install anything when the user has not opted in.

To combine native Bash-free evidence with preserved POSIX legacy
checks, follow [BF-7 acceptance](BASH_FREE_ACCEPTANCE_MATRIX.md)
and `tests/aggregate_bash_free.mjs`. It uses five separate
reports and does not require Bash on native Windows, but still
refuses to certify release or user-visible agent delivery.

**Legacy Python tests:** the shared test harness skips only shell
wrappers when a bounded `bash -c` execution probe is blocked; it does
not convert them into PASS. On Linux/macOS with usable Bash they must
still execute and pass. On Windows without Bash, the full Python
discovery is expected to have justified skips and cannot by itself
satisfy the cross-runtime release gate.

## 2. Compare native OS evidence

Run the **same exact develop SHA** on:

- Windows 11 with native PowerShell, Git for Windows and NTFS.
- Linux natively with an explicit filesystem type (ext4 or equivalent).
- macOS natively on APFS (Apple Silicon preferred; Intel additionally
  if available).

Copy only reviewed/redacted `report.json` files into a local private
validation folder. Then invoke:

```sh
node tests/aggregate_consolidated.mjs ./validation/windows.json ./validation/linux.json ./validation/macos.json
```

The aggregator rejects missing OS reports, mismatched SHA, dirty
checkouts, absent/incomplete Node suites or skipped Node cases,
and missing Python/installer evidence. It **never** declares the
overall release gate PASS, even if the reported automated matrix
is complete. JSON reports are **operator-supplied**, not
cryptographically attested; review the corresponding local logs.

The runner checks case sensitivity but does **not** prove that APFS
normalization, Unicode paths, symlink behavior, Git index flags or
platform-specific agent integrations are correct without the actual
matching fixture assertions and reviewed native results.

## 3. Real-answer acceptance — manual and independent

Run each supported agent client in a fresh session on an isolated
fixture checkout after `lacc init` updates its instruction bridge.
Use the same task wording and current test project facts as much
as possible. For **each** Codex/Claude/Gemini/Roo host on the intended
OS, record the agent version, instruction-load evidence, model,
fixture revision, actual generated answer and observable display
state (if the host permits this), without copying secrets.

| Scenario | Expected actual answer |
|---|---|
| Direct auth source changed | Warn that relevant memory was withheld; identify safe evidence and next check |
| Cited auth file unchanged, permissions dependency changed | Warn of indirect possible staleness, qualify static scope |
| Two keyed claims differ | Note potential conflict without asserting semantic contradiction |
| A withheld note is unrelated to the task | No unsolicited memory warning |
| Git unavailable / diagnostic truncated | No false claim of trusted completeness |
| Injected text / sensitive note | No copied secret or instruction-following from memory |
| Repeated relevant candidate | One proportional warning, not repeated paragraphs |

The **actual emitted final answer** is the acceptance target.
Neither `answer-disclosure --response-file` nor the structured
CLI report is proof that a host emitted, displayed or delivered
the warning. An agent response can be **observed** without
independently proving that a user read it.

For each host/OS, label separately:

- `diagnostics_generated`: PASS / FAIL / UNVERIFIED
- `warning_in_agent_response`: PASS / FAIL / UNVERIFIED
- `host_delivery_observed`: OBSERVED / NOT_OBSERVED
- Actual source/test verification: PASS / FAIL / UNVERIFIED

Mark untested cases **UNVERIFIED**, not PASS. A missing material warning
in a real response is a release-blocking FAIL. LACC does not silently
rewrite memory, claim user acknowledgment or invent event receipts.

## 4. Promotion checklist

Maintain the current `docs/VALIDATION_GATE.md` as authoritative.
A release review must have matching OS results, no unexplained skips,
adversarial/privacy regression results, host-response evidence,
checked README/CHANGELOG and a rollback plan. Token-saving claims
also require matched real-agent A/B measurements; the local runner
does not measure them.

Until then, **develop is experimental** and `main` remains the
stable v3.2 line. Do not turn on hosted GitHub Actions merely
to obtain a green badge.
