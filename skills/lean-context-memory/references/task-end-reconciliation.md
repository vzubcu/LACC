# ML-1 — Task-end memory reconciliation (develop preview)

**Scope:** Instructions plus a read-only Node.js inventory. LACC cannot
observe an agent's hidden reasoning or tool stream, infer novel facts from code
without the agent, or force Claude/Codex/Gemini/Roo to obey instructions. It
does not run in the background. Actual host compliance needs a real-agent test.

## Why this exists

A Rider Claude Agent pilot on a .NET notification connector found an incorrect
HOT hypothesis ("no CoreService tests"). The agent later found the test file
but did not amend memory until expressly requested. The new end-of-task
protocol asks the agent to compare the current task's *verified* discoveries
with HOT hypotheses and WARM facts and reconcile mistakes when allowed.

## Task-end workflow

1. Use the source files and tests inspected **during this task** as evidence,
   not guessed library behavior or a cached answer.
2. Run `node <skill_dir>/scripts/lacc.mjs task-end-review . --json`.
3. Compare new findings against relevant memory. Do not blindly accept
   `healthy` or `source-unchanged` as semantic correctness.
4. For each contradiction: correct the existing statement in place where
   possible; never preserve mutually exclusive confirmed claims.
5. For a newly proven, reusable invariant: save a concise topic bullet in
   the established syntax:
   `- Fact | source: \`src/file.ext\` | verified: \`<real commit>\``.
   Do not turn current dirty or uncommitted changes into facts falsely
   attributed to the old HEAD. Mark uncertain candidates `state: review`,
   or leave them in HOT as unresolved hypotheses.
6. Keep unresolved questions visible. Avoid copies of the same fact in
   multiple topics; exact duplicates are candidates for manual review, not
   evidence of identical intent.
7. Update the small HOT summary/index only when needed. Run `health` and
   `session-check` after edits. Record what changed, what was deferred and
   which tests actually ran.

If the task forbids *all file changes*, **do not write memory**. Use the
read-only command and report precise corrections for a future allowed task.
If nothing new is worth remembering, make no write and no extra pass over
the whole repository.

## Command contract

```powershell
node <skill_dir>/scripts/lacc.mjs task-end-review . --json
```

- Uses only built-in Node modules and Git. No Bash, Python, network or model
  call, no installed hook and no file writes.
- `schema: lacc.task-end-review.v1`.
- `status: agent-review-required` means freshness evidence is available;
  **agent semantic reconciliation is still mandatory**.
- `status: evidence-review-required` (exit 1) means incomplete/untrusted
  source or memory evidence. Invalid/unreadable HOT content fails closed
  (exit 2) without displaying its contents.
- `hot` reports locations/counts of hypotheses and unchecked HOT tasks
  without printing their potentially sensitive text.
- `exact_duplicates` reports only normalized *identical-text* WARM
  duplicates and source locations. Semantic overlaps are not detectable.
- `freshness` reuses the bounded `session-check` trust verdict.
  Source-backed facts are limited by the existing inventory/verification
  budget (currently 64 checked WARM facts per run). No claim about
  indirect dependency completeness.
- The command cannot know what the agent just learned or whether the final
  response was delivered to the user.

## Acceptance tests

```powershell
node --test --test-reporter=tap tests/test_task_end_review.mjs
node tests/run_consolidated.mjs --bash-free
```

For real-host acceptance, run an ordinary task (not a "please update memory"
prompt) in a fresh Claude Agent conversation, then see whether the agent:
(1) invokes the inventory; (2) corrects an evidence-refuted HOT fact if
edits are allowed; (3) retains unresolved claims; (4) avoids unnecessary
writes; (5) revalidates the result. Repeat with a user request forbidding
edits and ensure *no* memory file changes. Use actual session usage counters
for cost comparisons; the command doesn't measure tokens.

The ML-1 helper is a **candidate on develop**, not proof that automatic
agent learning has been achieved across all hosts. No macOS host acceptance
has been claimed.
