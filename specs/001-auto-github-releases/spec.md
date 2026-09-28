# Feature Specification: Automated GitHub Releases on Merge to Main

**Feature Branch**: `001-auto-github-releases`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "I want to implement a CI feature that automatically add releases to github when I merge to main branch"

## Clarifications

### Session 2026-09-28

- Q: Should automatic releases be published immediately, or created as drafts that you approve by hand later? → A: Publish immediately (Option A) — tag + public release, zero human steps; draft mode explicitly rejected as it reintroduces the per-release manual step SC-002 forbids. Note: the chosen release engine never creates Release PRs — that behavior belongs to a PR-based alternative already rejected in planning.
- Q: Should SC-001's 5-minute clock start when the merge lands, or when the automated checks pass? → A: From checks-passed — "within 5 minutes of the automated checks passing" (FR-006 forbids releasing before checks pass, so this is the only anchor the pipeline controls).
- Q: How is SC-006's "batch of 10 consecutive merges" validated? → A: Validation upgraded to a full 10-merge batch (quickstart S5, tasks T018); SC-006's criterion is unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A release is published automatically on every merge to main (Priority: P1)

As the project maintainer, I merge a change into the `main` branch and a new release appears on the
project's GitHub Releases page without me tagging, running commands, or filling in any form. The
merge itself is the only action I take; the release shows up on its own shortly after.

**Why this priority**: This is the whole point of the feature. Without it there is no value; every
other story builds on a release actually being created.

**Independent Test**: Merge any branch into `main` and observe the GitHub Releases page — a new
release exists for the merged change with no manual intervention.

**Acceptance Scenarios**:

1. **Given** the latest change on `main` has no release yet, **When** the merge completes and the
   project's automated checks pass, **Then** a new release is visible on the GitHub Releases page.
2. **Given** a release already exists for the current version, **When** another change is merged
   into `main`, **Then** a newer release with a higher version is created instead of a duplicate of
   the existing one.
3. **Given** the maintainer has done no release-related setup for this merge, **When** the release
   is created, **Then** no manual tagging, version entry, or release-page interaction was required.

---

### User Story 2 - Each release identifies exactly what shipped (Priority: P2)

As a user of the project, I open the releases page and see, for each release, the version number,
the date it was published, and a description of what changed since the previous release, so I can
decide whether to update without reading commit history.

**Why this priority**: A release without context is only a label; the notes are what make the
release useful to anyone outside the maintainer.

**Independent Test**: Open the releases page and confirm the newest release carries a version
greater than the previous one and notes listing the changes merged since the previous release.

**Acceptance Scenarios**:

1. **Given** three changes were merged since the last release, **When** the next release is
   published, **Then** its notes list all three changes and no changes from earlier releases.
2. **Given** a release exists for version X, **When** a later release is published, **Then** its
   version is greater than X and both releases remain available.
3. **Given** a release on the page, **When** a reader opens it, **Then** it points at the exact
   code state it was built from, so the published code can be retrieved later.

---

### User Story 3 - Production runs only what an automatic release published (Priority: P2)

As the maintainer, I know that every image pushed to the container registry and every production
update comes from an automatic release, and that no manual tag push can publish an image or bypass
the release flow — so what runs in production is always traceable to a release on the releases
page.

**Why this priority**: The merge-to-release flow changes how production gets updated; making the
release the only publishing path keeps release history and production state in lockstep. It
depends on the automatic release (P1) existing, but is independent of the release notes (P2).

**Independent Test**: Merge a passing change and confirm exactly one image tied to its release
reaches the registry and production, then push a version tag by hand and confirm no image is
published.

**Acceptance Scenarios**:

1. **Given** a merge into `main` passes the automated checks and produces a release, **When** the
   release is published, **Then** an image for that exact code state is pushed to the container
   registry and production is updated to it.
2. **Given** the automatic release is the only publishing path, **When** someone pushes a version
   tag by hand, **Then** no image is pushed to the registry and production is not updated.
3. **Given** a merge fails the automated checks and produces no release, **When** the checks
   finish, **Then** no image is pushed and production is not updated for that change.

---

### User Story 4 - Failed changes do not become releases (Priority: P3)

As the maintainer, I trust that a change that fails the project's automated checks never appears as
a published release, so the releases page only ever advertises change states that passed the same
gate we require locally.

**Why this priority**: Protects the credibility of the releases page, but only matters once
automatic releases (P1) and their notes (P2) exist.

**Independent Test**: Merge a change whose automated checks fail, then confirm no release was
published for it while a later passing change does get one.

**Acceptance Scenarios**:

1. **Given** a change merged into `main` fails the automated checks, **When** the checks finish,
   **Then** no release is published for that change.
2. **Given** a change failed its checks and a later change passes, **When** the later change's
   release is published, **Then** the failed change is not published as a separate release and the
   later release's notes do not claim the failed change shipped.

---

### Edge Cases

- Two changes are merged into `main` in quick succession: both must end up as releases, neither may
  overwrite or collide with the other, and the later merge must not get the earlier merge's version.
- A merge changes only documentation or tooling with no user-visible behavior change: it still gets
  a release (see Assumptions), with notes that honestly say what changed.
- The automated checks fail on a merge and the release step never runs: the missed release must not
  cause later releases to skip, duplicate, or reuse versions when a subsequent merge passes.
- The computed version number already exists as a prior release (e.g., a version was reused or
  created by hand): the system must not publish a duplicate — it must resolve to a higher unique
  version or surface the conflict as a failure the maintainer can see.
- This is the first release ever created (no prior release exists): the release still gets created,
  with notes covering the changes since the project's beginning or an explicit "first release"
  note.
- Release publication fails after the merge succeeds (permission or service problem): the failure
  must be visible to the maintainer through the automation's own status, and a retry must not
  produce a second release for the same change.
- The repository has pre-existing tags that do not follow one consistent shape (e.g., `v2.0`
  alongside `v3.0.0`): version derivation must still produce a sane, uniquely sortable next version.
- A merge mixes change types (e.g., a breaking change alongside fixes) or its type cannot be
  determined from its metadata: version inference must take the highest applicable increment, and
  fall back to a patch increment when nothing can be inferred, rather than stalling the release.
- Someone pushes a version tag by hand (the previous release habit): it must not publish an image
  or update production — only automatic releases may (FR-011).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically create a published GitHub Release for every change merged
  into `main`, with no manual tagging, version entry, or release-page interaction by the
  maintainer.
- **FR-002**: Every release MUST carry a unique version identifier that sorts higher than every
  previously published release, and no version may be reused for a different code state.
- **FR-003**: System MUST infer each release's version automatically from the type of change
  merged — a breaking change yields a major increment, a new capability a minor increment, and a
  fix or non-functional change a patch increment — with no version entered or confirmed by the
  maintainer.
- **FR-004**: Each release MUST reference the exact code state it was created from, so that state
  can be retrieved later.
- **FR-005**: Each release MUST include automatically generated notes summarizing the changes
  merged since the previous release, so a reader never has to inspect commit history to learn what
  shipped.
- **FR-006**: System MUST NOT publish a release for a change that failed the project's automated
  checks on `main`.
- **FR-007**: System MUST NOT publish duplicate releases: the same merged change must never produce
  two releases, and a retry after a publication failure must not double-publish.
- **FR-008**: Multiple merges in quick succession MUST each result in exactly one release, with no
  lost, swapped, or racing versions.
- **FR-009**: Release creation MUST be observable: when publication fails, the maintainer can see
  the failure from the automation's own status without reading logs by hand.
- **FR-010**: Every published automatic release MUST trigger the existing production deployment,
  so a merge that produces a release reaches production without a separate manual deploy step.
- **FR-011**: The automatic release flow MUST be the sole path that pushes images to the container
  registry and updates production; version tags pushed by hand MUST NOT publish an image or deploy.
- **FR-012**: The feature MUST require no committed secrets; it must operate with the repository's
  existing, centrally managed credentials and permissions.

### Key Entities *(include if feature involves data)*

- **Release**: A published snapshot of the project on the GitHub Releases page. Key attributes:
  unique version identifier, publication time, notes describing changes since the previous release,
  and a reference to the exact code state it represents. Releases are ordered by version and each
  code state appears at most once.
- **Merged Change**: A change accepted into `main`. It is the trigger for at most one release and
  carries the outcome of the project's automated checks, which gates whether the release may be
  published.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Within 5 minutes of the automated checks passing for a merge to `main`, a release
  for that merge is visible on the GitHub Releases page, with no maintainer action beyond the
  merge itself.
- **SC-002**: Maintainers perform zero manual steps per release — 100% of releases are produced
  without tagging, copy-pasting notes, or editing the releases page.
- **SC-003**: 100% of published releases have a unique, monotonically increasing version; zero
  duplicate or reused versions occur across the release history.
- **SC-004**: 100% of published releases include notes that account for the changes merged since
  the previous release, so a reader can identify what shipped without inspecting commit history.
- **SC-005**: Zero releases are ever published for changes that failed the automated checks on
  `main`.
- **SC-006**: For a batch of 10 consecutive merges to `main`, all 10 result in exactly 10 distinct
  releases, none missing and none duplicated.
- **SC-007**: When release publication fails, the maintainer can identify the failure from the
  automation's own status within one minute of the failure, without reading raw logs.
- **SC-008**: 100% of images in the container registry correspond to a published release; zero
  images are ever published outside the automatic release flow, including by hand-pushed tags.
- **SC-009**: After a change merges into `main` with passing checks, production runs that change
  within 15 minutes, with no maintainer action beyond performing the merge.

## Assumptions

- Every merge into `main` produces a release, including merges that only touch documentation,
  tooling, or chore files — the releases page mirrors merge history rather than curating it.
- Release notes are generated automatically from the changes merged since the previous release
  (merged pull requests and their titles/descriptions where available); no human writes the notes.
- The "automated checks" gating release publication are the same quality gate the project already
  requires for work to be considered complete (formatting, type check, lint, build, unit tests,
  end-to-end tests); this feature adds no new gate of its own.
- Releases are published directly (not left as drafts awaiting human approval), since the feature's
  stated purpose is to remove manual release work.
- Releases keep the repository's existing `v`-prefixed version convention.
- Version numbers are inferred automatically from the merged change (FR-003); the maintainer
  supplies no version input for a normal merge. Established, widely used release-automation
  tooling is expected to provide this inference rather than bespoke logic; the requirement is the
  observable outcome — correctly ordered, correctly segmented versions.
- When a merge mixes change types, the highest increment applies (major > minor > patch); when no
  type can be inferred, a patch increment is applied rather than blocking the release.
- The GitHub Releases page is the single destination for releases; no secondary changelog file or
  package registry publishing is in scope.
- The automatic release flow replaces the previous "push a version tag by hand to release" habit:
  hand-pushed tags no longer publish images or deploy (FR-010, FR-011). Deploying on every passing
  merge is accepted as the cost of merge-equals-release (maintainer's choice on Q2).
- This flow changes the deployment path documented in the project constitution (tag-driven
  releases). The constitution has been amended accordingly (**v2.0.0, MAJOR**, maintainer sign-off
  2026-09-28) as part of this feature's planning.
- The automation uses credentials and permissions already managed centrally for the repository;
  no secrets are committed and no new secret-handling surface is introduced (FR-012).
- Historical, pre-existing tags and releases are not rewritten, cleaned up, or back-filled by this
  feature.
