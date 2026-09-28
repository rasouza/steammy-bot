# Phase 1 Data Model: Automated GitHub Releases on Merge to Main

**Feature**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

This feature has **no database or application-schema changes**. Its "data" lives in git history,
GitHub Releases, and the container registry. Entities below are the domain objects the pipeline
must keep consistent.

---

## Entities

### Release

A published snapshot of the project on the GitHub Releases page (spec Key Entity: *Release*).

| Field            | Type / shape                | Rules (source)                                                        |
|------------------|-----------------------------|-----------------------------------------------------------------------|
| `version`        | semver, e.g. `3.0.1`        | Unique; sorts higher than every prior release (FR-002)                |
| `gitTag`         | `v<version>`, e.g. `v3.0.1` | Derived from `tagFormat`; one tag per release (FR-002, FR-004)        |
| `codeState`      | commit SHA                  | The merge commit the release was cut from (FR-004)                    |
| `notes`          | markdown                    | Auto-generated; covers all changes since previous release (FR-005)    |
| `publishedAt`    | timestamp                   | Set when GitHub Release is created (not drafted — Assumptions)         |
| `sourceChange`   | → Merged Change             | At most one release per merged change (FR-001, FR-007)                |

**Invariants**

- Ordering: releases are totally ordered by `version`; no duplicates, no reuse across different
  `codeState`s (FR-002, SC-003).
- Existence: exactly one release per merged change that passed checks; zero for changes that
  failed (FR-006, SC-005).
- Base state: first automated release builds on last valid semver tag `v3.0.0`; legacy two-part
  tags (`v1.0`…`v2.5`) are not valid semver and are ignored by the version resolver (research D1).

### Merged Change

A change accepted into `main` (spec Key Entity: *Merged Change*).

| Field          | Type / shape            | Rules (source)                                          |
|----------------|-------------------------|---------------------------------------------------------|
| `commits`      | ≥ 1 commit              | Commit messages carry the change type (contract)        |
| `changeType`   | `major \| minor \| patch` | Inferred from commits; highest wins; catch-all → patch (FR-003) |
| `checkOutcome` | `pass \| fail`          | From the gate job — the six-step CI sequence (FR-006)   |
| `release`      | → Release \| none       | `fail` ⇒ none; `pass` ⇒ exactly one (FR-001, FR-007)     |

**Validation rules (FR-003 + Assumptions)**

| Commit signal                       | Version segment |
|-------------------------------------|-----------------|
| breaking (`!` or `BREAKING CHANGE`) | major           |
| `feat`                              | minor           |
| anything else, incl. docs/chore, merge commits, non-conventional messages | patch |

Mixed types in one merge → highest segment. No inferable type → patch (never blocks a release).

### Image Artifact

The container image produced by a release (the only image source — FR-011).

| Field     | Type / shape                       | Rules (source)                                         |
|-----------|------------------------------------|--------------------------------------------------------|
| `digest`  | sha256 immutable id                | Generated at push; attestation subject (existing flow) |
| `tags`    | `latest`, `v<version>`, `<version>`, `sha-<short>` | `latest` required by `docker-compose.yml:8`; version tags from release output (research D6) |
| `platforms` | `linux/amd64`, `linux/arm64`     | Unchanged from current deploy                          |
| `release` | → Release                          | Required: no release ⇒ no image (FR-011, SC-008)       |

### Deploy Outcome

| Field        | Type / shape          | Rules (source)                                        |
|--------------|-----------------------|-------------------------------------------------------|
| `released`   | Release               | Trigger for deployment (FR-010)                       |
| `deployedAt` | timestamp             | ≤ 15 min after checks pass (SC-009)                   |
| `channel`    | production (Coolify)  | Unchanged; invoked in-run, never by tag events (D4)   |

---

## State Transitions (per merged change)

```text
MERGED ──▶ CHECKS_RUNNING ──▶ CHECKS_FAILED            (terminal: no release, no image — FR-006/FR-011)
                     │
                     └──────▶ CHECKS_PASSED ──▶ RELEASING ──▶ RELEASE_PUBLISHED ──▶ IMAGE_PUSHED ──▶ DEPLOYED
                                                  │
                                                  └──▶ PUBLISH_FAILED (workflow run fails —
                                                       observable via run status, FR-009;
                                                       retry safe: engine refuses duplicate tags, FR-007)
```

- **Serialization**: concurrent changes queue in the `release-main` concurrency group; states
  advance one change at a time (FR-008).
- **No silent skips**: if the release engine publishes nothing unexpectedly, the publish job's
  `if:` gate keeps images/release count in lockstep (invariant: `images ⊆ releases`).
- **Retry safety**: re-running a workflow after `PUBLISH_FAILED` must not create a second release
  for the same change (FR-007); duplicate-version conflicts surface as a visible run failure.

---

## Relationships

```text
Merged Change 1 ──── 0..1 Release 1 ──── 1 Image Artifact
                        │
                        └──── 0..1 Deploy Outcome
```

Release is the join point: every downstream artifact (tag, notes, image, deploy) hangs off exactly
one published release — the invariant the whole feature exists to enforce (SC-008).
