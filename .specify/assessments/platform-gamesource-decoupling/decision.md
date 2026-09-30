# Decision: Restructure the Platform Area (Split Platform Module + GameSource Module)

- **Slug**: platform-gamesource-decoupling
- **Decided**: 2026-09-30
- **Revised**: 2026-09-30 — maintainer directive; see Revision note
- **Verdict**: go — for **Option B** (the structural split); the measurement-first gate is lifted
- **Artifacts reviewed**: intake.md? | research.md? | problem.md | concept.md?

## Revision note

The original decision (preserved at the bottom of this file) chose **Option A — Validate
the Friction First**: measure integration cost before any structural change. The
maintainer has since ruled that the friction is already validated — the code-reading
evidence this assessment collected is accepted as sufficient grounds to restructure:

- the generic/platform-specific boundary lives inside one module and composition root
  (single-module layout decision R7, spec 003);
- edits outside the platform area exist today (baseline: 1 — `platform-option.dto.ts`)
  and registration touches 4–5 shared points regardless of layout;
- no non-author has ever validated the guide or the layout (STE-76 still open), so the
  "unmeasured" objection applies to the *status quo* just as much as to the change.

By maintainer decision the split (Option B, the intake's proposal) is now the chosen
approach. The dry-run baseline is **no longer a prerequisite** — it may still be captured
opportunistically, but nothing gates the split on it. Scorecard ratings below were
produced for the original Option A decision; the revision accepts Option B's medium
appetite and the R7 re-opening despite those ratings.

**Sequencing (FR-008 / SC-006, recorded 2026-09-30 before the first file move)**: this
split lands **first**; STE-74 (broadcast-tracking table) and the STE-75 levers (scaffold
generator, catalog-table unification) stay untouched throughout and are explicitly
sequenced after it (spec `specs/004-platform-gamesource-split/spec.md` Clarifications,
2026-09-30 Q2 — "Split first"). If either lands mid-effort, work pauses and rebases
before further file moves.

## Scorecard *(as assessed for the original decision)*

| Criterion | Rating | Justification |
|-----------|--------|---------------|
| Problem validity | adequate | The problem is a genuine, unresolved decision: the STE-1 refactor's DX claim was never validated by anyone but its author (STE-76 open, every baseline in `problem.md` = "unknown/not started"), and the maintainer's perceived boundary friction is real *as a concern* — but the friction itself is explicitly unmeasured, single-stakeholder perception, so it is not yet a demonstrated pain. |
| Evidence strength | adequate | Research is thorough and fully cited (merged spec 003 §R7 single-module decision, Linear STE-1/75/76, `d586177` merge stats, file/import counts, README/guide touch points); the core claim (friction exists) has no data and external prior art was refused under the URL policy — never `weak`/`unknown` because the *gap itself* is documented and cited, and the recommended concept exists precisely to close it. |
| Value vs. inaction | adequate | Inaction is bounded and known (current layout meets spec 003 acceptance; bot unaffected). Option A's value is informational: a days-scale, ~zero-risk baseline that prevents both a pointless 21-file churn **and** a wrongly deferred reorganization ("move twice" risk with STE-74/STE-75 hardening paths) — worth its small cost, but it delivers a decision, not user value. |
| Feasibility / appetite | strong | Option A is concrete and small: scratch-branch dry-run of the 9-artifact guide + STE-76 review, producing countable metrics (edits outside the platform area: baseline 1; time-to-integration; confusion points), no runtime change, CI gate stays green. Option B also has a credible medium appetite, but only as a gated follow-up. |
| Strategic fit | strong | Constitution Principle I ("Platform Definitions, Not Platform Branches") makes platform-add cost the charter concern, and its "abstraction MUST stop at what the second platform actually needs" clause directly favors measuring before splitting; the assessment closes the still-open STE-76, feeds STE-75 sequencing, and follows the repo's spec-driven/Linear workflow. |
| Risk posture | adequate | Key risks identified with mitigations: measurement theater → pre-commit to the verdict; layout drift → stable measurement window; double-move with STE-74/STE-75 → sequencing carried as an open question. Residual unmitigated risk: a true non-author reviewer may not exist in a single-maintainer repo, leaving a checklist-driven self-run as a knowingly weaker proxy. |

## If go — Handoff to `/speckit.specify`

- **Problem**: When integrating a new platform, the generic/platform-specific
  boundary lives inside one module and composition root, so the ownership boundary is
  illegible: a developer adding a platform edits the generic machinery's own folder as
  well as their implementation files, and there is no structural signal for "this is
  yours vs. this is the framework" — compounded by registration scatter and the
  storefront/GameSource vocabulary mismatch.
- **Chosen approach**: Concept **Option B — Split the Module**: restructure so the
  generic platform lifecycle/registry/scheduler lives in one module (a dependency
  implementors consume) and the per-platform implementations (Epic, Xbox, future Steam)
  live in a separate **GameSource** module — a developer adding a platform creates and
  touches files only inside their module. Vocabulary ("storefront" → "GameSource") is
  renamed to match wherever the boundary lands (per intake; carried question #3 resolved:
  the rename **is** part of the goal).
- **In scope**: the module split and import restructuring; dependency direction across
  the existing `PlatformsModule → BroadcastModule` edge (who owns the broadcast port);
  the vocabulary rename; keeping the full CI gate green; guide/README updates for the
  new layout; up-front sequencing decision against STE-74/STE-75 so files are not moved
  twice.
- **Out of scope**: the STE-75 levers (scaffold generator, catalog-table unification)
  and STE-74 (broadcast-tracking table); any runtime/behavior change (sync, broadcast,
  schedules, Discord delivery); the Option A measurement work as a gate (may be captured
  opportunistically, never blocking).
- **Success metrics**: a developer adding a platform creates/touches implementation
  files only inside the GameSource module, with any remaining registration touch points
  enumerated and justified; the CI gate passes on the final tree; the boundary is legible
  at a glance (ownership obvious without reading imports); sequencing against STE-74/75
  decided before any file moves.
- **Carried-forward open questions** (6 from `problem.md`; B resolves #3, re-raises #5):
  - [NEEDS CLARIFICATION: What measurable "easier" satisfies the maintainer, and today's baseline?] *(now partly a boundary-legibility definition: out-of-area edits and touch points to enumerate)*
  - [NEEDS CLARIFICATION: Relationship to Linear STE-75 — same initiative, successor, or competing approach; does this work need its own STE issue?]
  - [NEEDS CLARIFICATION: Is "GameSource" renaming part of the goal or incidental wording?] *(resolved: part of the goal per this decision)*
  - [NEEDS CLARIFICATION: What evidence would falsify the problem (e.g., STE-76 concludes the guide is already easy enough)?]
  - [NEEDS CLARIFICATION: Should STE-74 land before any structural change, to avoid moving files twice?] *(now blocking: decide before the split starts)*
  - [NEEDS CLARIFICATION: If no second contributor will exist, on what basis is contributor-facing separation valued?]

## Original decision *(superseded 2026-09-30 by the Revision note above)*

- **Verdict**: go — but the "go" was Option A (Validate the Friction First), not the
  original split.

> **Go — but the "go" is Option A (Validate the Friction First), not the original split.**
> The scorecard clears the bar: problem validity and evidence strength are both `adequate`
> (the evidence gap is itself well-evidenced and is the very object of the recommended
> work), a recommended concept exists, and strategic fit is strong under Constitution
> Principle I plus its over-abstraction constraint. The assessment's honest finding —
> recorded through research, problem, and concept — is that the intake's solution
> (two-module GameSource split) must not be built yet: layout decision R7 was argued three
> days ago, the split's headline metric may not improve (registration touch points exist
> either way), and re-churning the 44 files merged hours earlier on an unmeasured premise
> is exactly what the constitution's "abstraction stops at what the second platform needs"
> rule forbids. What *is* worth specifying is Option A: a small, falsifiable validation
> effort that produces the missing baseline, closes STE-76, and yields a go/no-go verdict
> for any structural change. No scorecard rating is `weak` or `unknown`; the acknowledged
> unknowns (time-to-integration baseline, non-author availability) are deliverables or
> risks of the chosen option, not blockers to deciding.

> **Original handoff (Option A)** — produce a baseline record
> (`specs/004-platform-dx-validation/baseline.md`), run the dry-run of the 9-artifact
> guide, close or document STE-76, and issue a go/no-go verdict for Option B. That
> handoff was realized as `specs/004-platform-dx-validation/`, which has been **rolled
> back in full** (spec, plan, tasks, Linear subtasks) per the Revision note; the full
> original text is preserved in git history of this file's session state and in the
> superseded spec's derivation record.
