# CR-3B — Answer-Level Disclosure Gate (planned)

**Status:** specification and release criteria only; **NOT IMPLEMENTED**.
**Target:** \`develop\`, before RD-5/CR-5 acceptance and any promotion
to \`main\`. Last updated: 2026-11-11.

**Community feedback (Exori AI):** excluding stale memory from trusted
retrieval is correct, but if the answer touches a withheld fact, the
user should learn that **in the answer**, not only from \`health\`
or a log.

## Problem and definition of success

A code change can invalidate the recorded evidence for a memory
fact. LACC's default trusted search correctly withholds that fact,
but an agent might still construct a response around the topic while
remaining silent about the excluded context. A background report is
not sufficient disclosure.

**Required behavior:** when a task/answer materially intersects an
excluded or review-required *matched* memory fact, the agent's actual
response must state that a potentially relevant memory claim was
withheld, identify the **safe, checked** source/dependency evidence
and the uncertainty, and say what current-code verification is needed.
The warning must appear in the answer **before or together with**
a conclusion that could otherwise imply the old fact was verified.

This is a release-blocking requirement for the agent workflow, not
a claim that LACC can intercept arbitrary host responses today.

## Proposed pipeline (NOT IMPLEMENTED)

1. **Bounded retrieval with excluded-candidate evidence.** Reuse CR-1
   \`search --explain --json\` and optionally \`--deps\`; do not
   issue a second independent Git trust verdict. Correlate query,
   task intent and proposed claims with relevant withheld fact IDs
   and cited source paths. A globally stale fact is *not* automatically
   relevant to every question.
2. **Decision contract.** Produce a bounded \`disclose_in_answer\`
   candidate (fact ID, evidence scope, changed source/chain, known
   coverage gaps, concise suggested message), or
   \`not_relevant\` with an explicit rationale. Never include raw
   private fact text, secrets or untrusted diagnostic prose.
   An incomplete search cannot be transformed into a certified
   absence of relevant excluded material.
3. **Answer composition.** The agent uses current source and tests
   as primary evidence and includes a brief relevant warning in
   its **own answer** when required. For example:
   "A previous project note about the authentication flow was
   withheld because its cited source/dependency changed since the
   recorded revision. I checked X; Y still needs verification."
4. **Response-level acceptance.** Inspect the **actual answer text**
   emitted by Codex, Claude, Gemini and Roo in controlled fixtures.
   Verify the material warning is present, specific, correctly
   qualified, and not repeated unnecessarily. A passing CLI test
   or an AGENTS.md instruction is not evidence that a response
   was generated or that a host displayed it.
5. **Host-delivery separation.** Track three different observations:
   \`diagnostics_generated\`, \`warning_in_agent_response\`,
   and \`host_delivery_observed\`. A generated response can prove
   the second without proving the third. Never invent a delivery
   receipt or state that a person saw the warning without trusted
   host evidence.

## Acceptance scenarios

| Fixture | Expected answer-level behavior |
|---|---|
| Direct cited source changed, fact withheld and relevant | User-facing warning about excluded fact and checked source |
| Unchanged cited file imports changed dependency | Mention indirect uncertainty, include adapter/coverage caveat |
| Two keyed facts conflict, but semantic contradiction is not proven | Describe competing evidence without asserting one false |
| Withheld fact unrelated to task | No distracting user-facing warning |
| Truncated diagnostics, missing Git/commit or unsupported language | Express relevant uncertainty; never say a complete scan passed |
| Source diff contains secret/PII/untrusted injection | No leaked raw note text or unsafe instructions |
| Repeat same relevant finding across prompt/task | Avoid redundant paragraphs; preserve review-required state |
| Actual answer omitted warning while CLI output flagged it | **FAIL release gate**, even if \`health\`/JSON passed |

## Platforms and hosts

Acceptance requires **native Windows, Linux and macOS** (including
macOS Apple Silicon when available) with Node.js 22+ and Git.
Verify real agent responses on Codex, Claude, Gemini and Roo only
where the host has a supported testable workflow. Record any
unavailable/unexercised host as **UNVERIFIED**, not PASS. Where a
host cannot expose a response event, do not claim its delivery is
observed. Do not depend on WSL, Docker, macOS-specific automation
on Windows, or unapproved host hooks.

A host that cannot satisfy this behavior should be clearly marked
unsupported for answer-level disclosure rather than quietly released
with an unconditional claim.

## Non-goals

- Automatically editing or approving memory.
- Proving semantic correctness from Git byte differences.
- Universal UI popups or a synthetic notification receipt.
- Sending response text, source content or private memory to an
  external service.
- Interrupting unrelated answers with generic warnings.

**Related milestones:** CR-1 structured findings; CR-2 evidence
chains; CR-3 instruction/disclosure contract; CR-4 grouping;
CR-5 host acceptance and release gate.

No implementation or behavioral validation is claimed by adding
this specification to the roadmap.
