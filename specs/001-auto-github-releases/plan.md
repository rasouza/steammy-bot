# Implementation Plan: Automated GitHub Releases on Merge to Main

**Branch**: `001-auto-github-releases` | **Date**: 2026-09-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-auto-github-releases/spec.md`

## Summary

Every merge to `main` automatically produces a published GitHub Release — version inferred from
the change itself, notes generated, zero maintainer steps — and that release is the *only* path
that pushes a container image and deploys to production. Implemented purely as CI: a new
`release.yml` chains the existing gate (`build.yml` as `workflow_call`) → `semantic-release`
(tag + release + notes) → `deploy.yml` (refactored to `workflow_call` only, image push +
Coolify). `deploy.yml`'s tag-push and manual triggers are removed so hand-pushed tags can never
publish (FR-011). No application, database, or schema changes.

## Technical Context

**Language/Version**: Node 24.21.0 / TypeScript 6 (application unchanged); feature = GitHub
Actions YAML + semantic-release config (JSON)

**Primary Dependencies**: GitHub Actions; semantic-release v24+ via `cycjimmy/semantic-release-action@v6`
(bundled plugins: commit-analyzer, release-notes-generator, github); existing docker/metadata-action,
buildx, attest-build-provenance, Coolify webhook — no new runtime dependencies

**Storage**: N/A — no entities, migrations, or schema changes; release state lives in git tags +
GitHub Releases (data-model.md)

**Testing**: existing Jest suites untouched (`npm test`, `npm run test:e2e` run inside the gate);
feature validated end-to-end via quickstart.md scenarios S1–S7 (no app code → no new unit specs)

**Target Platform**: GitHub-hosted `ubuntu-latest` runners; production images `linux/amd64` +
`linux/arm64` on ghcr.io; Coolify deployment (unchanged)

**Project Type**: CI/CD pipeline feature (repo: existing NestJS web service, untouched)

**Performance Goals**: release visible ≤ 5 min after checks pass (SC-001, timing interpretation
research D7); production running the merged change ≤ 15 min (SC-009)

**Constraints**: gate remains the exact six-step CI sequence (constitution IV); no committed or
new secrets (FR-012 — `GITHUB_TOKEN` + existing `COOLIFY_*` only); image push only from the
release chain (FR-011/SC-008); no npm publish; serialized releases with no version races
(FR-007/FR-008)

**Scale/Scope**: 1 repository; 20 existing tags (14 invalid semver, ignored); 575 commits; touches
only `.github/workflows/{build,deploy,release}.yml` + `.releaserc.json` + constitution amendment

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Constraint | Verdict | Evidence |
|------------------------|---------|----------|
| I. Platform definitions, not branches | **PASS** (N/A) | No platform/storefront code touched; `docs/plans/easy_add_platform.md` unaffected |
| II. Delivery before durable state | **PASS** (N/A) | No broadcast logic touched; the analogous invariant is honored structurally: image/deploy only after the release **publishes** (job `if:` gate), never "marked before delivered" |
| III. Migrations, never synchronize | **PASS** (N/A) | Zero schema/entity changes; migrations job still runs inside the gate, unchanged |
| IV. CI gate is the definition of Done | **PASS** | `build.yml` step content untouched; the chain's `gate` job *is* the six steps; no `npm run lint` introduced; eslint glob untouched |
| V. Tests live where Jest can find them | **PASS** (N/A) | No application code → no new Jest specs; validation is quickstart S1–S7 (workflow-level behavior has no Jest surface) |
| Runtime/toolchain constraints | **PASS** | No Node/npm/ESLint/tsconfig changes; `.nvmrc` honored by existing `setup-node` in the gate |
| **Deployment: "Releases are cut by pushing a `v*.*.*` tag"; `deploy.yml` on tag push** | **RESOLVED (amended 2026-09-28)** | FR-010/FR-011 (maintainer-approved, spec Q2) replace tag-push releases with automatic releases as the sole publish path. Constitution §Deployment rewritten, bump type **MAJOR** explicitly signed off by the maintainer; constitution now **v2.0.0**, AGENTS.md `## Deploy` updated to match (research D10). Amendment merges with the implementation. |
| Secrets / Dockerfile / compose rules | **PASS** | No `.env` handling changes; `COOLIFY_*` reused via `secrets: inherit`; compose still pulls `:latest`, which the new publisher keeps pushing (research D6) |

**Gate result**: **PASS**. The one conflict (§Deployment) was resolved by the maintainer-approved
**MAJOR** amendment (constitution v2.0.0, AGENTS.md updated) — see research D10. Design is fully
compliant.

## Project Structure

### Documentation (this feature)

```text
specs/001-auto-github-releases/
├── plan.md              # This file (/speckit.plan output)
├── spec.md              # Feature specification
├── research.md          # Phase 0 — decisions D1–D12, all unknowns resolved
├── data-model.md        # Phase 1 — Release/MergedChange/Image entities + state machine
├── quickstart.md        # Phase 1 — validation scenarios S1–S7
├── contracts/
│   ├── conventional-commits.md   # Contributor-facing commit contract
│   └── release-pipeline.md       # Workflow interface contract (gate/release/publish)
├── checklists/
│   └── requirements.md  # Spec quality checklist (16/16 pass)
└── tasks.md             # Phase 2 output (/speckit.tasks — NOT created here)
```

### Source Code (repository root)

```text
.github/workflows/
├── build.yml        # EDIT: drop `push: branches: [main]`; keep PR/dispatch/call + six steps
├── deploy.yml       # EDIT: workflow_call only (+inputs version/git_tag); tag/dispatch triggers removed
└── release.yml      # NEW: push→main; jobs gate → release → publish; concurrency release-main

.releaserc.json      # NEW: branches ["main"], tagFormat "v${version}",
                     #      plugins: commit-analyzer (releaseRules incl. catch-all),
                     #              release-notes-generator, github
```

No changes under `src/`, `test/`, `package.json`, `tsconfig*`, `Dockerfile`, or
`docker-compose.yml`.

**Structure Decision**: single flat addition — the pipeline *is* the feature, so the structure is
the three-workflow chain fixed by [contracts/release-pipeline.md](contracts/release-pipeline.md).
The gate and publisher stay in their existing files (narrowed triggers only) so their step
content, status-check names, and PR behavior are untouched.

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Constitution §Deployment: "Releases are cut by pushing a `v*.*.*` tag" + `deploy.yml` tag trigger | Spec FR-010/FR-011 (maintainer's explicit Q2 decision): automatic release must be the sole path that pushes images and deploys; merge = deploy | Keeping the tag-push flow would let hand-pushed tags deploy (violates FR-011/SC-008), and token-pushed release tags would never trigger it anyway (GitHub recursion rule, research D4) — so the old trigger is both unsafe and dead code. **Resolved: constitution amended to v2.0.0 (MAJOR, maintainer sign-off 2026-09-28); AGENTS.md `## Deploy` amended to match (research D10).** |
