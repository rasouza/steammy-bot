# Quickstart: Validating Automated Releases End-to-End

**Feature**: [spec.md](./spec.md) | **Contract**: [contracts/release-pipeline.md](contracts/release-pipeline.md) |
**Data model**: [data-model.md](./data-model.md)

Run these against the real repository after implementation. Each scenario maps to spec
requirements/SC so a pass here means the feature is done, not just "wired up".

## Prerequisites

- Push access to `rasouza/steammy-bot`; `gh` CLI authenticated.
- The constitution Deployment amendment merged (research D10).
- No local build/setup needed — everything runs on GitHub-hosted runners.

---

## S1 — Happy path: merge → release → image → production (FR-001, FR-010, SC-001, SC-009)

1. Open a PR with a single `fix: …` commit; merge it into `main`.
2. Watch the **Release** workflow: `ci` → `release` → `publish` all green.
3. Check results:

```bash
gh release list --limit 3          # newest is exactly one version above the previous, type=Latest
gh release view --json tagName,tagName,body
```

**Expected**: a release exists ≤ 5 min after checks pass (SC-001) with notes listing only this
merge's change (SC-004); `publish` job pushed an image; production updated ≤ 15 min after checks
passed (SC-009), no manual step taken anywhere (SC-002).

## S2 — Version inference (FR-003)

Repeat S1's merge with commits of each type, in order: `docs: …`, then `fix: …`, then
`feat: …`, then a breaking change (`feat!: …`).

**Expected**: versions advance `patch → patch → minor → major` relative to the previous release
(data-model mapping table). All four merges produce releases (every-merge-release assumption).

## S3 — Failed checks produce nothing (FR-006, SC-005, FR-011)

1. Merge a PR whose commit breaks a lint rule (e.g. unformatted `src/` file).
2. After the run finishes:

```bash
gh release list --limit 1          # unchanged from before the merge
```

**Expected**: `ci` fails; `release`/`publish` never run; no release, no image tag, no deploy.

## S4 — Hand-pushed tag is inert (FR-011, SC-008)

```bash
git tag v9.9.9 && git push origin v9.9.9
gh run list --limit 5              # no new run appears
```

**Expected**: zero workflow runs, zero new images in `ghcr.io/rasouza/steammy-bot`, production
untouched. (`deploy.yml` no longer has tag or manual triggers — contract §3.)

## S5 — Rapid merges serialize (FR-007, FR-008, SC-006)

Merge 10 small PRs into `main` back-to-back, each with a distinct conventional commit
(`fix: s5-01` … `fix: s5-10`), in as short a window as possible.

**Expected**: Release runs **queue** behind each other (concurrency group), then all complete →
exactly 10 new releases with 10 distinct, strictly increasing versions; no failed run, no
duplicate tag; each release's notes contain only its own merge (research D5).

## S6 — Registry exclusivity (SC-008)

```bash
gh api /users/rasouza/packages/container/steammy-bot/versions --paginate \
  --jq '.[].metadata.container.tags[]' | sort -u
```

**Expected**: every tag set corresponds to a published release version or a release's
`sha-…`/`latest`; no image exists without a matching release. (Repeat S4 and re-run: still no new
tags.)

## S7 — Release-engine dry run (diagnostics, FR-009)

If a run fails, the failure is visible on the workflow run page without reading raw logs
(SC-007). For local diagnosis of version computation only:

```bash
npx semantic-release --dry-run --no-ci   # prints would-be version/notes; publishes nothing
```

**Expected**: dry run reports the same next version the pipeline would publish; a real failure
(e.g. tag conflict) fails the `release` job loudly rather than skipping silently.

---

## Pass criteria

All S1–S7 pass ⇒ spec Success Criteria SC-001…SC-009 are demonstrably met. S4 and S6 are the
must-not-regress scenarios: they prove the old manual tag-deploy path is truly gone.
