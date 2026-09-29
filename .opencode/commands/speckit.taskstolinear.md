---
description: Convert tasks.md into Linear issues (subtasks of the feature's Linear issue) with deduplication by task ID.
---

## User Input

```text
$ARGUMENTS
```

You **MUST** consider the user input before proceeding (if not empty). `$ARGUMENTS` may name the Linear parent issue explicitly (e.g. `STE-16`) or a project name; otherwise the target is resolved from the current branch (see step 3).

## Pre-Execution Checks

**Check for extension hooks (before tasks-to-Linear conversion)**:
- Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.before_taskstolinear` key.
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user that `.specify/extensions.yml` could not be read (include the parser error) and that no hooks were checked, including any mandatory (`optional: false`) hooks registered there, then continue normally.
- Filter out hooks where `enabled` is explicitly `false`. Treat hooks without an `enabled` field as enabled by default.
- For each remaining hook, do **not** attempt to interpret or evaluate hook `condition` expressions:
  - No `condition`, or null/empty → executable.
  - Non-empty `condition` → skip and leave evaluation to the HookExecutor implementation.
- For each executable hook:
  - **Optional** (`optional: true`):
    ```
    ## Extension Hooks

    **Optional Pre-Hook**: {extension}
    Command: `/{command}`
    Description: {description}

    Prompt: {prompt}
    To execute: `/{command}`
    ```
  - **Mandatory** (`optional: false`):
    ```
    ## Extension Hooks

    **Automatic Pre-Hook**: {extension}
    Executing: `/{command}`
    EXECUTE_COMMAND: {command}

    Wait for the result of the hook command before proceeding to the Outline.
    ```
    After emitting the block you MUST actually invoke the hook and wait for it to finish before continuing. Run it the same way you would run the command yourself in this agent/session (the invocation may differ from the literal `{command}` id, e.g. a skills-mode agent runs it as `/skill:speckit-...` or `$speckit-...`). Emitting the block alone does not run the hook.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

## Outline

1. Run `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` from repo root and parse FEATURE_DIR and the absolute path to **tasks**. For single quotes in args like "I'm Groot", use escape syntax: e.g 'I'\''m Groot'.
1. **IF EXISTS**: Load `.specify/memory/constitution.md` for project principles and governance constraints.

1. **Resolve the Linear target**, in this order:
   1. `$ARGUMENTS` naming an issue identifier (e.g. `STE-16`) → that issue is the parent.
   2. Otherwise `git branch --show-current` and match `\bSTE-\d+\b` case-insensitively against the branch name → that issue is the parent. Linear's suggested branch names (`feature/ste-16-...`) already satisfy this.
   3. Otherwise → no parent: tasks become top-level issues in the `steammy-bot` project.
   If a resolved identifier does not exist in Linear, **STOP and ask** — never invent or guess a parent issue.

1. Read the target with the Linear MCP:
   - Parent case: `get_issue` → capture `teamId` and `projectId`.
   - No-parent case: `get_project` (`steammy-bot`) → capture the lead team id.

1. **Parse tasks.md.** Task lines are strict checklists: `- [ ] T001 [P] [US1] Description with file path`. Match `^- \[( |x|X)\] (T\d{3,})\s+(.*)$` while walking the file, remembering the nearest `## Phase` / `###` heading so each task keeps its phase context. The `{3,}` matters: once a file has more than 999 tasks the IDs are four digits (`T1000` must not fail to match — see `\b` caveat below).

1. **Fetch existing issues for deduplication** before creating anything:
   - Parent case: `list_issues` with `parentId` set to the parent, `fields: ["id", "title", "status"]`, `limit: 250` (paginate with the returned cursor if `hasNextPage`).
   - No-parent case: `list_issues` scoped to project `steammy-bot` instead.
   - For each existing title, match the task-ID pattern `\bT\d{3,}\b`. The `{3,}` accepts four-digit IDs — with `\d{3}` a title containing `T1000` would not match (the trailing `\b` cannot fall between two digits) and that task would be silently neither deduplicated nor created; word boundaries stop a token like `ST001` from matching and force the whole digit run to be consumed so `T100` can never match inside `T1000`. This also recognises `T001 ...`, `T001: ...` and `[T001] ...`.
   - Mark matched IDs as already having an issue. Stop paginating once every task ID is matched or pages run out, so re-runs after `tasks.md` regeneration don't fetch the whole issue history.

1. **Create one Linear issue per unmatched task** with the Linear MCP's `save_issue`:
   - **Title**: canonical `T001: <description>` — the ID once, followed by the description with `- [ ]`, `[P]` and `[US1]` markers stripped (e.g. `- [ ] T005 [P] Implement authentication middleware in src/middleware/auth.ts` → `T005: Implement authentication middleware in src/middleware/auth.ts`).
   - **team**: the id resolved in step 4. **project**: `steammy-bot`. **parentId**: the parent when one was resolved.
   - **state**: `backlog`.
   - **description** (Markdown, literal newlines):
     - the verbatim task line from `tasks.md`
     - `**Source:**` the path to tasks.md relative to the repo root, plus the phase heading it sits under
     - `[P]` parallel marker and `[USn]` story label kept verbatim, with a one-line note of what the marker means
     - any task IDs referenced in the description as `**Depends on:** T00x` when the line names dependencies
   - **Skip** any task whose ID already has an issue and report it (`T001 already has an issue, skipping`).

> [!CAUTION]
> Create issues **only** in the `steammy-bot` project of the connected Linear workspace. This command targets Linear only — it never creates GitHub issues. If GitHub issues for these tasks were created by `/speckit.taskstoissues` earlier, report the overlap to the user instead of silently duplicating work.

1. Report a completion summary: parent/project used, created count, skipped count, and the Linear URL of the parent (or project).

## Post-Execution Checks

**Check for extension hooks (after tasks-to-Linear conversion)**:
Check if `.specify/extensions.yml` exists in the project root.
- If it exists, read it and look for entries under the `hooks.after_taskstolinear` key.
- If the YAML cannot be parsed or is invalid, do not skip silently: tell the user (include the parser error) that no hooks were checked, then continue normally.
- Filter out hooks where `enabled` is explicitly `false`; missing `enabled` = enabled.
- Do **not** evaluate `condition` expressions — non-empty `condition` → skip, leave to the HookExecutor.
- **Optional** (`optional: true`) → emit:
  ```
  ## Extension Hooks

  **Optional Hook**: {extension}
  Command: `/{command}`
  Description: {description}

  Prompt: {prompt}
  To execute: `/{command}`
  ```
- **Mandatory** (`optional: false`) → emit:
  ```
  ## Extension Hooks

  **Automatic Hook**: {extension}
  Executing: `/{command}`
  EXECUTE_COMMAND: {command}
  ```
  then actually invoke it and wait for the result before reporting completion.
- If no hooks are registered or `.specify/extensions.yml` does not exist, skip silently.

## Completion Report

- Path to tasks.md processed
- Total task count, created, skipped (deduplicated)
- Parent issue or project used, with URL
- Whether GitHub-issue overlap was detected

## Done When

- [ ] Linear target resolved from args, branch key, or project — never guessed
- [ ] Dedupe ran against existing Linear issues before any creation
- [ ] Every unmatched task exists as a subtask titled `T001: <description>` in `steammy-bot`
- [ ] No GitHub issues created by this command
- [ ] Extension hooks dispatched or skipped per the rules above
- [ ] Completion reported with created/skipped counts
