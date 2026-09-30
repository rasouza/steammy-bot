# Quickstart Validation Guide: Platform Area Split — Framework vs. GameSource

- **Feature**: [spec.md](./spec.md) | **Contracts**: [define-gamesource.md](./contracts/define-gamesource.md) | **Data/rules**: [data-model.md](./data-model.md) | **Date**: 2026-09-30
- Run from the repo root against the PR head (commits C1–C4 per [research.md](./research.md) R5). Each scenario is a check with an expected outcome; run S8 last.

## Prerequisites

- Branch `feature/ste-75-simplify-adding-new-storefront-platforms` (STE-75 key) based on current `origin/main`.
- `npm ci --ignore-scripts`.
- Base ref for diff comparisons: the branch point (`origin/main` at PR time).

**Baseline evidence** *(captured T002, 2026-09-30)*:

- Base ref SHA: `d586177e24977898f9358f8370e71e3f6edfc237` (`origin/main` at branch point).
- Pre-split shared touch-point count: **4–5** (assessment `decision.md` revision note: "registration
  touches 4–5 shared points regardless of layout"; post-split contract target: 2 — SC-001).
- Baseline gate: green on `d586177` (six CI steps, T001 — result recorded at S8 evidence).

## S0 — Pre-flight

1. `git log --oneline origin/main..HEAD` shows **C0** (records: `specs/004-…` + `.specify/assessments/…` — carries the FR-008 sequencing record, SC-006) followed by the four expected commits (C1 move, C2 restructure, C3 sweep, C4 docs) — no commit mixes kinds (R5); C0 precedes C1 in history (SC-006 commit ordering).
2. Base gate is green (it is, on `origin/main`).

## S1 — Target structure exists

1. `src/gamesources/{game-platform.ts,index.ts,epic/,xbox/}` exist; each platform folder holds api + mapper + repository (+ specs) and an entry export using `defineGameSource`.
2. `src/modules/platforms/define-gamesource.ts` exists; `platform.constants.ts` is gone; `platform.factory.ts` is gone or folded (R3).
3. **Expected**: tree matches plan §Project Structure exactly.

## S2 — Machinery purity (FR-001, SC-001)

Scoped to **runtime files** (`--exclude="*.spec.ts"`): SC-003's constraint is on runtime-internal files; colocated specs necessarily name platforms as fixtures.

1. `grep -rniE "epic|xbox" src/modules/platforms/ --exclude="*.spec.ts"` → zero hits.
2. `grep -rn "GamePlatform" src/modules/platforms/ --exclude="*.spec.ts"` → zero hits (keys never named in the machinery).
3. `grep -rn "storefront" src/modules/platforms/ --exclude="*.spec.ts"` → zero hits (feeds S6; expected green from C3/T020 onward).
- **Expected**: no per-platform data, keys, names, or component imports in the machinery; any other hit = fail, fix before proceeding.

## S3 — Acyclic dependency direction (SC-003)

1. `grep -rn "from '.*gamesources/" src/modules/platforms/ --exclude="*.spec.ts"` → exactly one hit: `platform.registry.ts` imports `../../gamesources/index.js` (prose comments may mention the path; imports may not).
2. `grep -rn "^import.*modules/platforms/" src/gamesources/` → only `define-gamesource.js` and `platform.types.js` (plus `game-platform` as the area's own file) — never `registry`, `scheduler`, `generic-platform`, or `platforms.module`.
3. `npm run type:check` passes (the graph compiles without `forwardRef` or cyclic shims — `grep -rn forwardRef src/` → zero hits).
- **Expected**: contract §4 of the definition file holds line by line.

## S4 — Behavior frozen (FR-005, SC-002)

1. `git diff <base>...HEAD -- 'src/**/*.spec.ts'` — inspection rules: changed lines may be import paths and `it(...)`/`describe(...)` titles only; **every `expect(` line must be byte-identical**.
2. `git diff <base>...HEAD -- src/modules/broadcast src/modules/subscription` — changed lines limited to import paths, the admin name-lookup (admin only), and DTO choice literals if moved; broadcast/send logic untouched.
3. **Expected**: zero diff in delivery ordering code (pending → send → mark), zero assertion changes.

## S5 — Touch-point walkthrough (FR-003, SC-001/SC-005)

Paper walkthrough of "add Steam" against the **rewritten guide** (S7):
1. Files edited: `gamesources/steam/*` (own folder) + `gamesources/game-platform.ts` (key) + `gamesources/index.ts` (one line) + `platform-option.dto.ts` (choices) + the entity-registration pair (`entities/index.ts` export, `data-source-options.ts` array — standard AGENTS rule for any new catalog table).
2. Files outside the own folder: **5** — registration proper **3** (pre-split 4: constants, registry, module, dto) + 2 DB files on both sides → 5 ≤ pre-split 6 (within the recorded baseline 4–5) → SC-001 passes.
3. No file in `src/modules/platforms/` is edited → FR-001 passes.
- Any extra file in the walk = guide gap → fix guide or file it (US2 acc. 3).

## S6 — Vocabulary sweep (FR-004, SC-004)

1. `grep -rni "storefront" src/ README.md docs/` → **zero hits** (all 12 inventoried files swept — R4).
2. Living records — exempt occurrences are only self-referential ones: the branch name in `spec.md` L3 (STE-75 key), the Input quote (L9), historical Clarification bullets (L25–26, L135), the meta-scenario line (L60), and the normative FR-004/SC-004 rule texts that *define* the rename (L72/109/129); in `decision.md` the living handoff's vocabulary use was swept (was L49), the remaining hits L54/59 name the rename pair itself (exempt — same class as FR-004's own text), and the superseded original-decision section (L84+) contains none. Vocabulary *use* in living records → zero.
3. Database schema and Discord strings unchanged: `git diff <base>...HEAD -- src/database/` → empty; Discord choice display values unchanged.
- **Expected**: source/living-docs clean, history intact.

## S7 — Guide & README match reality (FR-007, US2)

1. `docs/platform-integration.md` step list references only the new paths (`src/gamesources/<name>/`, `defineGameSource`, central list) and contains the touch-point contract section naming exactly the shared files of S5 (game-platform key, central list, DTO, entity-registration pair).
2. `README.md` "Adding more platforms" section matches the guide's steps.
3. Cross-check: every guide step names files that exist (`ls` spot checks).

## S8 — Full quality gate (FR-006, SC-005, Constitution IV)

All six, in order, all green:

```bash
npx prettier --check "src/**/*.ts" "test/**/*.ts"
npm run type:check
npm run lint
npm run build
npm run test:cov
npm run test:e2e
```

## S9 — FR-009 cleanup (post-landing, separate change — do NOT run in this PR)

1. The split PR has merged; a follow-up change then: `git mv docs/plans/*.md docs/`, remove `docs/plans/`, update the three `docs/plans/` references in AGENTS.md.
2. **Expected**: `test -d docs/plans` fails (gone); `grep -rn "docs/plans" AGENTS.md README.md` → zero hits; both plan records still readable under `docs/`; the follow-up commit does not touch `src/`.

## Verdict

The feature is done when S0–S8 pass on the PR head and S9 is queued as its own
post-landing change. Merge → Linear syncs via the native integration → STE-75 issue
closes only when every task checkbox is checked (after_converge hook rules).

### Validation evidence (T025, 2026-09-30, PR head)

| Scenario | Result |
|----------|--------|
| S0 | base `d586177` gate green; history = C0 records + C1–C4, kinds unmixed |
| S1 | structure as specified (folders + entries + machinery-only module) |
| S2 | purity greps all zero (runtime files); S2.3 zero from C3 on |
| S3 | exactly one bridge (`platform.registry.ts`); no `forwardRef`; type-check green |
| S4 | all **91** `expect(` lines byte-identical to `origin/main`; broadcast/subscription diffs = import paths + type widening only |
| S5 | Steam walkthrough: own folder + 5 enumerated shared files (3 registration, was 4) ≤ pre-split 6; nothing under `src/modules/platforms/` |
| S6 | zero "storefront" in src/README/docs; living-record hits only in exempt classes; `src/database/` diff empty; Discord choice literals identical |
| S7 | guide references only new paths; every named file exists; README matches |
| S8 | six-step gate green at every commit (C0–C4) — 39 unit + 1 e2e passing, warnings-only lint (22 baseline) |
