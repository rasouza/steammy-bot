---
description: Sync tasks.md progress to Linear — issue status transitions and a summary comment (started | implemented | converged | sync).
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty).

**Mode** = the first whitespace-separated token of `$ARGUMENTS`:

| Mode | Dispatched by | Effect |
|---|---|---|
| `started` | `before_implement` | parent issue → In Progress; no subtask changes; short comment |
| `implemented` | `after_implement` | subtasks ← checkboxes; parent ensured In Progress; comment with open tasks |
| `converged` | `after_converge` | subtasks ← checkboxes; parent → Done **only if** every task is checked; comment with gate summary |
| `sync` | manual / default | subtasks ← checkboxes only; parent untouched; no comment unless something changed |

Anything after the mode token is a free-text note (e.g. the convergence gate results) that MUST be included in the comment. Unknown or empty mode → treat as `sync` and say so.

## Pre-Execution Checks

**Check for extension hooks (before status sync)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_linear_status` key.
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user (include the parser error) that no hooks were checked, including any mandatory (`optional: false`) ones, then continue normally.
- Filter out hooks where `enabled` is explicitly `false`; missing `enabled` = enabled.
- Do **not** evaluate `condition` expressions — non-empty `condition` → skip, leave to the HookExecutor.
- **Optional** (`optional: true`) → emit the `**Optional Pre-Hook**` block (`Command: /{command}`, `Description`, `Prompt`, `To execute`) and wait for the user before proceeding if they choose to run it.
- **Mandatory** (`optional: false`) → emit:
  ```
  ## Extension Hooks

  **Automatic Pre-Hook**: {extension}
  Executing: `/{command}`
  EXECUTE_COMMAND: {command}

  Wait for the result of the hook command before proceeding to the Outline.
  ```
  then actually invoke it and wait for the result before continuing. Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

## Outline

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from repo root and parse the absolute path to **tasks**. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot'.

1. **Resolve the parent Linear issue**, in this order:
   1. An issue identifier (`STE-16`) appearing in `$ARGUMENTS` → that issue.
   2. Otherwise `git branch --show-current` → match `\bSTE-\d+\b` case-insensitively → that issue.
   3. Otherwise → **no status transitions are possible** (there is no issue to transition). Parse and report progress, skip all `save_issue`/`save_comment` calls, and tell the user to pass the issue identifier. Never guess a parent.

1. **Parse tasks.md** with `^- \[( |x|X)\] (T\d{3,})\s+(.*)$`:
   - `total` tasks, `done` (checked `[x]`/`[X]`), `open` (unchecked `[ ]`)
   - keep ordered lists of open `T`-IDs and done `T`-IDs with their descriptions

1. **Fetch the current state of children**: Linear MCP `list_issues` with `parentId` = the parent, `fields: ["id", "title", "status", "statusType"]`, `limit: 250` (paginate if `hasNextPage`), and `get_issue` on the parent itself for its current status. Match children to tasks with `\bT\d{3,}\b` on the title — same word-boundary rules as `/speckit.taskstolinear` (`T1000` must match; `ST001` must not).

1. **Apply the mode.** Linear state resolution: `save_issue` accepts a state *type*, so use types, not display names — `backlog` (Backlog), `unstarted` (Todo), `started` (In Progress), `completed` (Done), `canceled` (Canceled).

   **Idempotency rule for every `save_issue`: only call it when the issue's current `statusType` differs from the target.** Re-running a mode must be a no-op when nothing changed.

   - `started`:
     - parent → `started`, unless it is already `started` or `completed`.
     - subtasks untouched.
     - comment on the parent: `🔶 Implementation started (/speckit.implement) — X/Y tasks complete at start.`
   - `implemented`:
     - subtask with checked box → `completed` (if not already).
     - subtask with unchecked box whose Linear statusType **is** `completed` → revert to `unstarted` (checkbox is the source of truth; this fixes a stale Done).
     - every other subtask status left untouched (Backlog stays Backlog, In Progress stays In Progress — the GitHub integration and manual moves must not be churned).
     - parent → `started` (if not `started`/`completed`).
     - comment: `📥 Implemented — X/Y tasks done. Open: T00x, T00y, …` (or `all tasks done`).
   - `converged`:
     - same subtask sync as `implemented`.
     - `open == 0` → parent → `completed`; `open > 0` → parent left as-is (it stays In Progress), and the comment says convergence did NOT close it.
     - comment MUST include: task counts, the open task IDs when any, and the free-text note from `$ARGUMENTS` (the gate results — prettier/type:check/lint/build/test/test:e2e per the plan being executed). Start with `✅ Converged` when complete, `⚠️ Converged with N open tasks` otherwise.
   - `sync`: subtask sync only; parent untouched; comment only if at least one status actually changed.

1. **Comment** with the Linear MCP's `save_comment` (`issueId` = parent, `body` = Markdown with real newlines — never escaped `\n`). One comment per invocation; never edit or duplicate an existing one.

1. Report what changed: statuses moved, comment posted, or "already up to date".

## Post-Execution Checks

**Check for extension hooks (after status sync)**:
Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.after_linear_status` key.
- Invalid YAML → report the parser error, then continue normally.
- Filter `enabled: false`; missing `enabled` = enabled. Do not evaluate `condition` expressions.
- **Optional** → emit the `**Optional Hook**` block with `Command`/`Description`/`Prompt`/`To execute`.
- **Mandatory** → emit `EXECUTE_COMMAND: {command}` with the `**Automatic Hook**` block, then actually invoke it and wait for the result before reporting completion.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

## Completion Report

- Mode executed and parent issue (with URL)
- Parse results: total / done / open tasks
- Statuses changed (before → after), or "no change — already in sync"
- Comment posted (or skipped, and why)

## Done When

- [ ] Parent resolved from args or branch key — never guessed; if unresolved, transitions skipped and reported
- [ ] Checkbox state parsed with the `T\d{3,}` word-boundary-safe pattern
- [ ] Every `save_issue` was idempotent (only on actual status mismatch)
- [ ] `converged` closes the parent only when zero tasks are open, and always includes the gate note
- [ ] One summary comment posted via `save_comment` with literal newlines
- [ ] Extension hooks dispatched or skipped per the rules above
- [ ] Completion reported with before → after statuses
