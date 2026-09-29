# Requirements Quality Checklist: Nest 12 Toolchain and ESM Migration

**Purpose**: "Unit tests for English" over `spec.md` — tests whether the requirements are
complete, clear, consistent, measurable, and fully covered, not whether the implementation works.
**Created**: 2026-09-29 (pruned and decided same day at reviewer request)
**Feature**: [spec.md](../spec.md)

**Review Ownership**: This checklist is a reviewer-owned requirements-quality review artifact. Mark an item `[x]` only when the reviewer determines the requirements-quality criterion is satisfied.
**Marker Semantics**: `[x]` means the criterion has been reviewed and satisfied for requirements quality. It does not mean implementation work is complete.

**Pruning note**: The original 25 items were reduced to the 4 that remain genuinely open.
21 items were removed at the reviewer's request (2026-09-29): 15 were already settled by this
session's remediation and `/speckit.analyze` (evidence in session record), 6 were trivially
satisfied or mechanics owned by the plan document per the spec's precedence rule. Original CHK
IDs are preserved for traceability.

## Open Items

- [x] CHK003 Does the spec say whether moving or renaming source files is allowed in this "tooling-only" change? [Gap, Spec §FR-001 scope]
  > **Decision 2026-09-29 (reviewer): fence it.** Applied — FR-011 now bars moving, renaming,
  > or reorganizing source files; only toolchain configuration files may be added or replaced.

- [x] CHK014 Do any of the user stories specify what happens when something fails (e.g., the gate goes red mid-phase), or are only success paths described? [Coverage, Gap, Spec §US1–US3]
  > **Decision 2026-09-29 (reviewer): gate covers it.** FR-013's stop-at-red-gate rule is the
  > failure requirement; no additional user-story scenario needed.

- [x] CHK015 Does the spec say what to do if the stricter rules surface type errors that already exist in the code today — fix them in-phase, defer them, or how can the phase still count as "green"? [Gap, Spec §FR-002/FR-013]
  > **Decision 2026-09-29 (reviewer): fix in-phase.** Applied — FR-013 now requires surfaced
  > pre-existing type errors to be fixed before that phase's gate may pass; suppression,
  > exclusion, and deferral are forbidden.

- [x] CHK022 The spec has no Dependencies section — are version floors (Node ≥24.15, package majors) intentionally placed in Assumptions, or should a Dependencies section exist? [Assumption, Gap, Spec §Assumptions]
  > **Decision 2026-09-29 (reviewer): intentional.** Version floors remain in Assumptions; no
  > Dependencies section required.

## Notes

- Mark items `[x]` only after review confirms the requirement-quality criterion is satisfied; leave unchecked while clarification is still needed
- Decisions and findings are recorded as inline quotes beneath each item
- `/speckit.implement` reads checklist checkbox state as a gate and must not modify markers
- `checklists/requirements.md` has a separate built-in lifecycle maintained by `/speckit.specify` and `/speckit.clarify`
