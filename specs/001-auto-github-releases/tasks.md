---

description: "Task list template for feature implementation"
---

# Tasks: Automated GitHub Releases on Merge to Main

**Input**: Design documents from `/specs/001-auto-github-releases/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: No Jest/unit test tasks — this feature changes no application code (plan.md: no `src/` changes;
Principle V has no surface here). Verification is via quickstart.md scenarios (S1–S7), attached to the
story each scenario proves.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

**Already done during planning** (do not redo): constitution amendment §Deployment → **v2.0.0 (MAJOR)**
and `AGENTS.md ## Deploy` rewrite (research D10). They must simply be present in the working tree (T003).

**Validation reality**: `release.yml` triggers only on push to `main`, so scenario runs (S1–S7) happen
**after this feature merges** — the feature's own merge produces the first automatic release (version
depends on this feature's commit messages: `feat:` commits → `v3.1.0`, otherwise `v3.0.1`; research D2).
Pre-merge validation = PR gate (build.yml still runs on `pull_request`) + workflow-YAML review.
Scenario tasks below say "post-merge" where that applies.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Single repository; all paths relative to repo root. Structure per plan.md:

```text
.github/workflows/build.yml      # EDIT (gate)
.github/workflows/deploy.yml     # EDIT (publisher → workflow_call only)
.github/workflows/release.yml    # NEW (orchestrator)
.releaserc.json                  # NEW (release engine config)
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Get onto the feature branch with a verified-green baseline and the constitution amendment in hand

- [X] T001 Create feature branch `001-auto-github-releases` off `main` (currently on `main`; run `git switch -c 001-auto-github-releases`) with the existing uncommitted `specs/` + amended constitution/AGENTS.md carried over
- [X] T002 [P] Verify baseline is green: run the constitution Principle IV sequence locally (`npx prettier --check "src/**/*.ts" "test/**/*.ts"` → `npm run type:check` → `npx eslint "{src,apps,libs,test}/**/*.ts"` → `npm run build` → `npm test` → `npm run test:e2e`)
- [X] T003 [P] Verify governance artifacts present in tree: `.specify/memory/constitution.md` shows `**Version**: 2.0.0` with the automatic-release Deployment section, and `AGENTS.md` `## Deploy` describes the `release.yml` chain (amended during planning, research D10)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared pipeline skeleton every user story plugs into

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create release-engine config `.releaserc.json` per research D1/D2: `branches: ["main"]`, `tagFormat: "v${version}"`, plugins `@semantic-release/commit-analyzer` (with `releaseRules`: `{breaking: true, release: "major"}`, `{type: "feat", release: "minor"}`, `{type: "*", release: "patch"}`, `{header: "**", release: "patch"}`, `{message: "{*,**}", release: "patch"}` — the catch-all is mandatory, `{type:"*"}` alone misses typeless merge commits; **shape corrected 2026-09-28** from the planned `{message: "*"}` because micromatch `*` does not match `/` and squash-merge titles routinely contain branch paths, verified against micromatch in local plugin tests), `@semantic-release/release-notes-generator`, `@semantic-release/github`; NO npm/git plugins (research D8); both commit-consumer plugins load the shared parser/writer preset via `config: ./scripts/conventional-commits-preset.mjs` (added by T010 — the bundled angular preset drops docs/chore/merge commits from notes and misses `feat!:`)
- [X] T005 Edit `.github/workflows/build.yml`: remove `push: branches: [main]` from `on:`; keep `pull_request`, `workflow_dispatch`, `workflow_call` and all step content byte-identical (contract §1 — step content is frozen by Principle IV)
- [X] T006 Create `.github/workflows/release.yml` skeleton: `on: push: branches: [main]`; workflow-level `concurrency: { group: release-main, cancel-in-progress: false }` (FR-008, research D5); workflow-level `permissions: { contents: read }` baseline (jobs elevate per contract §2 — no workflow-wide write grants); job `gate` with `uses: ./.github/workflows/build.yml` (contract §2)

**Checkpoint**: Chain skeleton exists; gate runs on main pushes before any release logic

---

## Phase 3: User Story 1 - A release is published automatically on every merge to main (Priority: P1) 🎯 MVP

**Goal**: Merge to `main` → checks pass → GitHub Release appears, version inferred, zero manual steps (FR-001, FR-002, FR-003)

**Independent Test**: Merge a `fix:` commit to `main`; a release exists ≤5 min after checks pass with an
inferred version above the previous release (quickstart S1 release part + S2)

### Implementation for User Story 1

- [X] T007 [US1] Add job `release` to `.github/workflows/release.yml` with `needs: gate`: checkout `fetch-depth: 0` **plus** an explicit `git fetch --force --tags` step (missing tags ⇒ duplicate releases, research D5), `actions/setup-node` pinned to `.nvmrc`, then `cycjimmy/semantic-release-action@v6` with `env: GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}` and a step `id:` (contract §2); job-level `permissions: contents: write` (tag push + release creation)
- [X] T008 [US1] Expose job outputs on `release` in `.github/workflows/release.yml`: `new_release_published`, `new_release_version`, `new_release_git_tag` from the step id (contract §2 — US3's publish gate consumes these)
- [ ] T009 [US1] Post-merge validation: run quickstart S1 (release section) and S2 (version inference: `docs:`→patch, `fix:`→patch, `feat:`→minor, `feat!:`→major) using small follow-up PRs; confirm SC-001 (≤5 min after checks pass), SC-002 (zero manual steps), SC-003 (unique increasing versions)

**Checkpoint**: US1 MVP live — every passing merge becomes a release. Note: this chain already *creates* the tag and notes (US2), but does not yet publish images (US3) or gate ordering is verified per US4.

---

## Phase 4: User Story 2 - Each release identifies exactly what shipped (Priority: P2)

**Goal**: Notes summarize exactly the changes since the previous release; the release points at the exact
code state (FR-004, FR-005)

**Independent Test**: `gh release view` on the newest release: notes list all changes since the previous
release and none older; tag resolves to the merge commit (quickstart S1 notes check)

### Implementation for User Story 2

- [X] T010 [US2] Verify/tune `@semantic-release/release-notes-generator` settings in `.releaserc.json` so notes are scoped to commits since the previous release only, sourced per the contract `contracts/conventional-commits.md` (FR-005, SC-004); adjust commit-consumer config only — do not touch releaseRules (owned by T004)
- [ ] T011 [US2] Post-merge validation: `gh release view --json tagName,targetCommitish,notes` — confirm tag → merge commit (FR-004), notes cover every change since the previous release and nothing earlier (SC-004), across at least two consecutive releases

**Checkpoint**: US2 independently verifiable — releases are self-describing

---

## Phase 5: User Story 3 - Production runs only what an automatic release published (Priority: P2)

**Goal**: The release chain is the sole path that pushes images and deploys; hand-pushed tags do nothing
(FR-010, FR-011, SC-008, SC-009)

**Independent Test**: Merge a passing change → image + production update; then `git tag v9.9.9 && git push
origin v9.9.9` → no run, no image, no deploy (quickstart S4 + S6)

### Implementation for User Story 3

- [X] T012 [US3] Refactor `.github/workflows/deploy.yml` to `workflow_call` only: delete `on: push: tags` and `on: workflow_dispatch`; add required `workflow_call.inputs` `version` and `git_tag`; rewrite the metadata step's image tags to come from inputs — `latest` (required by `docker-compose.yml:8`), `v<version>`, `<version>`, `sha-<short>` — never from `github.ref` (research D6, contract §3); keep buildx/multi-arch/attest/Coolify steps unchanged
- [X] T013 [US3] Add job `publish` to `.github/workflows/release.yml`: `needs: [gate, release]`, `if: needs.release.outputs.new_release_published == 'true'`, `uses: ./.github/workflows/deploy.yml`, `with: { version: …, git_tag: … }` from release outputs, `secrets: inherit`; job permissions `contents: read`, `packages: write`, `attestations: write`, `id-token: write` (contract §2; no new secrets — reuse `COOLIFY_*`, FR-012)
- [X] T014 [US3] [P] Confirm the sole-push invariant across the repo: `grep -rn "ghcr\|docker/build-push" .github/workflows/` shows image pushes only inside `deploy.yml`, and no workflow anywhere declares tag or `workflow_dispatch` publish triggers (SC-008, contract cross-cutting invariants)
- [ ] T015 [US3] Post-merge validation: quickstart S4 (manual tag inert), S6 (registry `latest`/version/sha tags all map to releases), and S1 end-to-end (image pushed + production running the change ≤15 min after checks pass — SC-009)

**Checkpoint**: US3 independently verifiable — merge = deploy; hand-pushed tags are dead

---

## Phase 6: User Story 4 - Failed changes do not become releases (Priority: P3)

**Goal**: A change that fails the gate never becomes a release or an image; failures are visible; retries
never duplicate (FR-006, FR-007, FR-008, FR-009, SC-005, SC-006)

**Independent Test**: Merge a lint-breaking change → no release, no image; re-run the failed workflow →
still no duplicate; two rapid merges → two serialized unique releases (quickstart S3, S5)

### Implementation for User Story 4

- [X] T016 [US4] Audit and enforce chain ordering in `.github/workflows/release.yml`: `release` strictly `needs: gate`, `publish` strictly `needs: [gate, release]` with its `if:` — assert no path exists from a failed gate to release/publish (FR-006); add explicit `if:` guards where implicit `needs` failure propagation is not sufficient
- [ ] T017 [US4] Post-merge validation: quickstart S3 (failing merge ⇒ unchanged `gh release list`, no image, no deploy — SC-005) and SC-007 (failed run identifiable from the Actions run page without raw logs)
- [ ] T018 [US4] Post-merge validation: quickstart S5 (10 back-to-back merges ⇒ exactly 10 distinct increasing releases via the `release-main` concurrency queue — SC-006/FR-008) plus FR-007 retry check: re-run a failed `publish` job and confirm no second release/tag appears for the same change

**Checkpoint**: All four stories independently validated

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Docs sweep, full-scenario pass, and the governance re-check

- [X] T019 [P] Sweep documentation for stale tag-push deploy instructions: `README.md` (Deploy/Releases sections), `docs/` — align wording with the new chain; `AGENTS.md` and constitution already amended (verify only)
- [ ] T020 Run the complete quickstart.md suite S1–S7 post-merge and record each result against SC-001…SC-009 (quickstart.md "Pass criteria")
- [X] T021 Final Definition of Done: run the constitution Principle IV six-step sequence locally on the final tree (same commands as T002) — all six must pass
- [X] T022 [P] Re-check `plan.md` "Constitution Check" against the shipped workflows (the plan mandates a post-Phase-1 re-check): confirm §Deployment text, `release.yml`, `build.yml`, and `deploy.yml` are mutually consistent — no tag/manual publish path anywhere

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3–6)**:
  - **US1 (P1)**: starts after Foundational; it is the MVP
  - **US2, US3, US4**: all require US1's `release` job + outputs (T007/T008)
  - After US1: **US2 ∥ US3 ∥ US4** can proceed in parallel (US2 touches `.releaserc.json`, US3 touches `deploy.yml` + `publish` job, US4 audits `release.yml` ordering)
  - Suggested sequential order when single-threaded: US1 → US2 → US3 → US4
- **Polish (Phase 7)**: depends on all stories being complete (T020 runs the full suite)

### User Story Dependencies

- **User Story 1 (P1)**: after Foundational only — no other story dependencies (MVP)
- **User Story 2 (P2)**: after US1 — notes config lives in the same `.releaserc.json` T004 created; independently testable via `gh release view` even if US3/US4 never start
- **User Story 3 (P2)**: after US1 — consumes release job outputs; independently testable via S4/S6 even if US2/US4 never start
- **User Story 4 (P3)**: after US1 — audits the chain US1 built; independently testable via S3/S5 even if US2/US3 never start

### Within Each User Story

- Implementation tasks before validation tasks (validation needs the thing to validate)
- T007 → T008 strictly sequential (same file, outputs depend on the job)
- Validation tasks marked "post-merge" run after the feature lands on `main` (first release: research D2)

### Parallel Opportunities

- T002 ∥ T003 (Setup)
- T010 ∥ T012 ∥ T016 after US1 (three different files: `.releaserc.json`, `deploy.yml`, `release.yml` audit)
- T014 runs ∥ T015 (repo grep is independent of live-scenario runs)
- T019 ∥ T020 ∥ T022 (different artifacts), with T021 strictly last

---

## Parallel Example: User Story 3

```text
Launch together after US1 (T007/T008) is done:
  Task: "T012 Refactor .github/workflows/deploy.yml to workflow_call-only with input-driven image tags"
  Task: "T014 Confirm sole-push invariant across .github/workflows/ (grep for ghcr pushes + triggers)"

Then sequential:
  Task: "T013 Add publish job to .github/workflows/release.yml (needs/if/secrets/permissions)"
  Task: "T015 Post-merge validation S4 + S6 + S1 end-to-end"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T006) — CRITICAL, blocks all stories
3. Complete Phase 3: US1 (T007–T009)
4. **Merge to `main`, then STOP and VALIDATE**: first automatic release appears; versions infer correctly
5. At this point the feature already delivers its headline value (SC-001/002/003)

### Incremental Delivery

1. Setup + Foundational → chain skeleton, gate on main restored
2. + US1 → automatic releases (MVP!)
3. + US2 → releases self-describing (notes/code-state verified)
4. + US3 → merge = deploy, hand-pushed tags inert (production behavior changes here — land it deliberately)
5. + US4 → failure/no-duplicate guarantees audited and scenario-proven
6. Polish → full S1–S7 pass, docs sweep, constitution re-check

### Parallel Team Strategy

With multiple developers: complete Setup + Foundational together, then split after US1 —
Developer A: US2 (`.releaserc.json` notes), Developer B: US3 (`deploy.yml` + `publish`),
Developer C: US4 (ordering audit). Watch for one shared-file overlap: US4's audit may suggest
edits to `release.yml` while US3 adds the `publish` job — serialize `release.yml` edits (US3 first,
then US4 audit).

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- No `src/`, `test/`, `package.json`, `Dockerfile`, or `docker-compose.yml` changes are ever in scope (plan.md Structure Decision)
- Version rule of thumb for the first release: this feature's own commit messages decide — `feat:` ⇒ first release `v3.1.0`, `chore:`/`docs:` only ⇒ `v3.0.1` (research D2)
- Stop at any checkpoint to validate a story independently
- Commit after each task or logical group (atomic commits; a commit referencing a document includes that document)
- Avoid: vague tasks, same-file conflicts across parallel stories, reintroducing tag/manual publish triggers
