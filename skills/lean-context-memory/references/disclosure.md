# CR-3 — Agent disclosure and host integration contract

**State:** develop-only, tests authored but NOT EXECUTED.
**Scope:** communication *guidance*, not a universal notification API.
Portable Node.js 22+ and Git remain the baseline.

## What problem does CR-3 solve?

When a memory fact's source (or an imported dependency) changed, CR-1/CR-2
can report the evidence to an AI agent. That fact should not be silently
used as a fresh, verified statement. An agent handling a *relevant*
task must tell the user what was potentially outdated and what was or
was not checked, without overclaiming a semantic contradiction.

An LACC command can show data to an agent, but cannot observe whether
Codex, Claude, Gemini, Roo or another host rendered a response to the
user. The contract distinguishes these states:

1. **Detected / reported to agent:** the opt-in CLI emits diagnostics.
2. **Agent instructed to disclose:** the generated agent instruction
   block tells the agent to communicate relevant, material uncertainty.
3. **Delivered to user:** **NOT OBSERVED** by the LACC runtime.
   Only a host-specific, trusted delivery event can establish this.
   No such event hook or receipt verifier is implemented in CR-3.

No popup, email, push notification, host callback, timer or background
process is installed.

## Commands

```powershell
node <skill_dir>/scripts/lacc.mjs disclosure-contract
node <skill_dir>/scripts/lacc.mjs search . --query "auth policy" --explain --json
node <skill_dir>/scripts/lacc.mjs session-check . --deps --explain --json
node <skill_dir>/scripts/lacc.mjs dependency-impact . --explain --json
```

The first command is read-only contract introspection and can run
without a project directory. It reports four instruction bridges
and `verified_delivery: false` / `delivery_confirmation:
"not-integrated"` for all of them.

When `--explain --json` is requested, normalized CR-1 findings include
an additive `disclosure_protocol` object:

```json
{
  "schema": 1,
  "status": "agent-guidance-only",
  "user_delivery": "not-observed",
  "delivery_confirmed": false,
  "candidates_before_output_budget": 1,
  "candidates_incomplete": false,
  "relevance": "agent-must-evaluate-current-task",
  "instruction": "For relevant findings, inform the user of uncertainty, evidence and next verification step before relying on affected memory.",
  "do_not_claim": "Do not claim semantic contradiction or user notification without independent evidence."
}
```

The sample is illustrative. Actual candidates depend on the bounded
diagnostics. The candidate count is computed **before** the final
output-byte cap, and must not be presented as the number of messages
delivered to the user. Where a scan is incomplete or results truncated,
absence of visible candidates does not imply no risk.

`notification: "agent-output-only"` and every finding's
`disclosure: "reported-to-agent-only"` remain unchanged for
compatibility. The additional CR-3 metadata is generated locally and
does **not** carry credentials, raw remembered claim text or external URLs.

## Host-specific instruction bridges

On project setup, or to update an existing installed bridge, run:

```powershell
node <skill_dir>/scripts/lacc.mjs init . --agent all
```

The command maintains a clearly marked LACC block while preserving
surrounding project instructions:

- **Codex:** shared project-root `AGENTS.md`.
- **Claude:** `CLAUDE.md` with `@AGENTS.md` reference.
- **Gemini:** `GEMINI.md` referring to marked `AGENTS.md` rules.
- **Roo:** `.roo/rules/lean-context-memory.md` referring to `AGENTS.md`.

`--agent auto` maintains the shared file and only native instruction
files that already exist; `--agent all` creates/maintains all bridges.
Each host still controls whether it loads and obeys a particular
instruction file. Merely writing an instruction is not proof it was
read or that the user received the warning. Previously initialized
projects need to rerun `init` to refresh their marked block.

## Disclosure procedure for agents

- Before using memory for a task, run the normal session/recall
  checks, then inspect `--explain --json` diagnostics where review
  is relevant. Use optional `--deps` for static dependency checks.
- Assess **task relevance**: unrelated or low-confidence findings
  should not become disruptive unsolicited alerts.
- If a finding materially affects the answer or intended change,
  tell the user, briefly, (a) what might be stale, (b) which cited
  source/dependency or Git baseline was checked, (c) what could not
  be verified, and (d) what you will inspect or recommend next.
- Recheck current source and tests before describing current behavior.
  Git byte drift alone is not proof the remembered claim is false.
- Keep messages proportional; deduplicate repeated warning IDs
  within the same answer. Never copy secrets, raw untrusted notes
  or full diagnostic dumps into the user's conversation.
- Preserve original memory facts pending source review. Do not
  automatically mark them confirmed or rewrite their Git baseline.
- If the host cannot display a message, return machine-readable
  findings or state that delivery is unconfirmed. Do not claim the
  user was notified or saw an alert without host-provided proof.

Suggested *communication style* (example, not automatic output):

> LACC detected a possible mismatch: the rule recorded in memory
> cites src/auth.ts at an earlier Git revision, but the checked source
> or one of its dependencies changed. The claim needs revalidation.
> I will inspect the current code before relying on it.

## Not implemented

- No user-alert popup, platform notification, email, chat API sending,
  push delivery, user acknowledgment/receipt logging.
- No host-specific telemetry, event listeners or synthetic delivery
  receipts; a CLI report is not a delivery event.
- No semantic conflict verdict, automatic repair, global dependency
  resolution, or source revalidation.
- No persistent **suppression** or user-delivery store. CR-4 now
  offers optional task-scoped agent-seen metadata and grouped summaries,
  never automatic suppression or claimed user acknowledgment. See
  [CR-4 disclosure UX](disclosure-ux.md).
- No executed cross-host acceptance evidence yet (CR-5).

## Local acceptance (deferred until develop release gate)

`tests/test_agent_disclosure_protocol.mjs` exercises contract
introspection, false-delivery prevention, normalized disclosure
guidance, Codex/Claude/Gemini/Roo bridge generation and idempotency,
preserving existing project instructions, optional search reporting
and no automatic memory mutation.

Use an isolated test repository; never assume host-specific UI
delivery from local CLI tests. See
[CR-1 findings](findings.md) and
[CR-2 evidence chains](evidence-chains.md).

## CR-3B — agent answer-level disclosure (develop only; tests unexecuted)

Before a material answer about a prior project-memory claim, run:

```powershell
node <skill_dir>/scripts/lacc.mjs answer-disclosure . --query "login policy" --json
```

The CLI reuses trust-filtered search to emit bounded, safe, query-matched
excluded-fact candidates and a suggested warning; optional `--deps` and
`--claim` provide bounded extra relevance hints. Agents must decide actual
materiality and include a relevant warning **in the final answer**, not
just in a log, while checking current code/tests. No raw note content is
required. An unrelated finding should not generate a distracting alert.

Optional `--response-file` checks whether the exact canonical warning
appears in an explicitly supplied local draft. That check is **not** proof
of what a host generated or delivered. All CLI results retain
`warning_in_agent_response: "not-observed"` and
`host_delivery_observed: "not-observed"` until independent host evidence
is collected. Missing/truncated Git evidence never certifies a clean scan.
Rerun `init` after updating to refresh marked agent instructions.

See the [CR-3B answer-level design and acceptance contract](
../../../docs/architecture/answer-level-disclosure-gate.md).
