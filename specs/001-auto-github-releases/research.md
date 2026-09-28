# Phase 0 Research: Automated GitHub Releases on Merge to Main

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-09-28

All Technical Context unknowns are resolved below; no `NEEDS CLARIFICATION` markers remain.

---

## D1. Release tooling: semantic-release

**Decision**: Use **semantic-release** (via `cycjimmy/semantic-release-action@v6`) as the release
engine. It runs on push to `main`, infers the next semver version from commit messages, generates
release notes, creates the `v<version>` tag, and publishes the GitHub Release — all in one
unattended run.

**Rationale**:

- Satisfies FR-001/SC-002 (zero manual steps): release-please's model requires a human to merge a
  "Release PR" before the release exists, which is a manual step per release and fails SC-002.
- Satisfies FR-003: version inference from change type is its core behavior (commit-analyzer).
- Satisfies FR-005: `@semantic-release/release-notes-generator` + `@semantic-release/github`
  produce and attach the notes automatically.
- Mature, widely deployed, no bespoke inference logic (spec assumption: prefer established
  tooling).
- Bundled plugins (commit-analyzer, release-notes-generator, github) need no extra installs; no
  `@semantic-release/npm` (no npm publish — constitution Deployment: "There is no npm publish
  step").

**Alternatives considered**:

| Alternative           | Rejected because                                                                                     |
|-----------------------|------------------------------------------------------------------------------------------------------|
| release-please        | Release-PR model adds a manual merge per release → violates SC-002 "zero manual steps"               |
| changesets            | PR-based, package-publishing oriented; same manual-step problem                                       |
| commit-and-tag-version| Offline bump/tag only; notes + GitHub release still need bespoke glue                                 |
| Custom auto-bump script | Bespoke inference logic the spec explicitly wants to avoid; re-implements established tooling poorly |

**Verified facts** (Context7, semantic-release docs):

- `tagFormat: "v${version}"` produces tags matching the repo's `v*.*.*` convention and the
  existing `deploy.yml` pattern.
- `getTags` builds a regex from `tagFormat`, runs `semver.clean()` on matches, and **keeps only
  valid semver tags** → the repo's legacy two-part tags (`v1.0`, `v1.1`, `v2.0`…`v2.5`) are
  ignored; **last release resolves to `v3.0.0`** (verified: `v3.0.0` is an ancestor of `main`).
- Resolves `false` (no release) when there are "no relevant commits" — must be eliminated (D2).

---

## D2. Version inference rules: catch-all releaseRules

**Decision**: Configure `@semantic-release/commit-analyzer` with explicit `releaseRules`
containing a **catch-all** so every commit yields at least a patch:

```json
"releaseRules": [
  { "breaking": true, "release": "major" },
  { "type": "feat",   "release": "minor" },
  { "type": "fix",    "release": "patch" },
  { "type": "*",      "release": "patch" },
  { "message": "*",   "release": "patch" }
]
```

**Rationale**:

- Mapping matches FR-003 exactly: breaking → major, feat → minor, everything else → patch.
- Rule matching uses `micromatch.isMatch` for strings, and **the highest matching rule wins**
  (`compareReleaseTypes` across all matched rules) — so `{message:"*"}` lifts every commit to at
  least patch while `feat`/`breaking` still win. This is what guarantees the spec assumption
  "every merge produces a release, including docs/chore-only merges".
- `{type:"*"}` alone is **not** sufficient: commits with no parsed type (merge commits
  `"Merge pull request #N…"`, non-conventional messages) have `type: null` and fail string
  matching. `{message:"*"}` matches every commit because `message` is always a string.
- Mixed change types in one merge automatically take the highest segment (rule accumulation) —
  covers the spec edge case; no type inferable → patch (catch-all) — covers the fallback edge
  case.

**Repo fit** (verified against `git log`): history is already overwhelmingly conventional
(`feat:`, `fix:`, `docs:`, `chore:`, `build:`, `refactor:`, `test:`, with scopes). Non-conforming
messages degrade gracefully to patch instead of blocking a release (FR-003 fallback).

**First-run expectation**: commits since `v3.0.0` are only `chore:`/`docs:` (+ merge commits) →
first automated release is **`v3.0.1`** as of this plan date.

**Alternatives considered**: commit-message footers only (`BREAKING CHANGE:`) without rules —
would not map `docs`/`chore` to patch and would break every-merge-release; PR-label-based
inference — reintroduces maintainer input per merge (fails SC-002) and needs label discipline.

---

## D3. Workflow topology: one chained run, reusable gate and deploy

**Decision**: A single new workflow `release.yml` on `push: branches: [main]` chains all three
stages as jobs of the same run:

```text
push to main
  └─ job "gate"     → uses: ./.github/workflows/build.yml   (workflow_call; the six CI steps + migrations)
       └─ job "release" → cycjimmy/semantic-release-action  (needs: gate)
            └─ job "publish" → uses: ./.github/workflows/deploy.yml (workflow_call; image push + attest + Coolify)
                                if: new_release_published == 'true'
```

Concurrent pushes serialize via a workflow-level `concurrency` group
(`group: release-main`, `cancel-in-progress: false`).

**Rationale**:

- FR-006 (no release on failed checks) requires release to *depend* on the gate, not race it.
  Chaining jobs makes the dependency structural.
- FR-011/SC-008 (only the release flow pushes images): `deploy.yml` is reduced to
  `workflow_call` only — its `push: tags` **and** `workflow_dispatch` triggers are removed, so a
  hand-pushed tag or manual dispatch has nothing to invoke.
- `build.yml` loses its `push: branches: [main]` trigger (keeps `pull_request`,
  `workflow_dispatch`, `workflow_call`) so main-push CI runs exactly once, inside the chain —
  otherwise every merge runs the six-step gate twice. PR gating is unchanged.
- Single run gives `publish` a stable `github.sha` and lets `if:` gate image push on the actual
  release outcome (FR-011: no release → no image).

**Alternatives considered**:

| Alternative                              | Rejected because                                                                                                                    |
|------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Separate workflow on `release` event     | Release created with `GITHUB_TOKEN` **does not trigger** other workflows (GitHub recursion rule, see D4) → deploy would never run     |
| Keep `deploy.yml` on `push: tags`        | Same recursion rule: the auto-created tag would *not* fire it; and a *hand-pushed* tag *would* fire it → violates FR-011              |
| `workflow_run` chaining after `build.yml`| Runs against `head_sha` while `main` may have advanced; harder to serialize; subtle payload/checkout pitfalls; no benefit over one chain |

---

## D4. GitHub token recursion rule (hard constraint)

**Decision**: The release tag and GitHub Release are created with the default `GITHUB_TOKEN`
(`permissions: contents: write`). The deploy **must be a job in the same run** — it can never be a
downstream workflow triggered by the tag or release event.

**Rationale** (GitHub Docs, "Triggering a workflow", verified 2026-09-28): events caused by
`GITHUB_TOKEN`, except `workflow_dispatch`/`repository_dispatch`, do not create new workflow runs.
So `on: push: tags` after a token-pushed tag silently never fires. Conversely, a tag pushed by a
*human* would fire it — which is exactly what FR-011 forbids. Removing the trigger satisfies both
facts at once.

**Alternative**: use a PAT/GitHub App token to make the tag push trigger workflows — rejected:
requires a new long-lived credential (conflicts with FR-012 "no new secret-handling surface") and
still leaves hand-pushed tags able to deploy (FR-011).

---

## D5. Concurrency: serialized releases, per-run SHA checkout

**Decision**: `concurrency: { group: release-main, cancel-in-progress: false }` at workflow level.

**Rationale**: FR-008 requires exactly one release per merged change with no racing versions.
Without serialization, two runs could compute the same next version and collide on tag creation.
Queued runs execute in trigger order; each run releases the commits reachable from *its own*
trigger SHA up to the latest tag, so two queued merges produce two ordered releases.

**Verified behavior** (Context7, semantic-release source): the local-vs-remote "branch behind"
check only runs when `git push --dry-run` (verifyAuth) fails. With `GITHUB_TOKEN` push
authentication succeeding, a run proceeds from its checked-out state even if `main` advanced —
releasing exactly its commit window; the next queued run picks up from the freshly pushed tag.

**Checkout requirement**: `fetch-depth: 0` **plus** an explicit tag fetch in the release job
(`git fetch --force --tags`) so the second run sees the first run's tag. Missing tags would make
run 2 re-release run 1's commits → duplicate version (FR-007 risk). This is a contract item
(`contracts/release-pipeline.md`).

---

## D6. Image tagging contract

**Decision**: The `publish` job derives image tags from the release action's outputs
(`new_release_version`, `new_release_git_tag`) rather than from `github.ref` (which is now
`refs/heads/main`, not a tag):

- `latest` — **required**: `docker-compose.yml:8` pins `ghcr.io/rasouza/steammy-bot:latest` and
  Coolify pulls it.
- `v<version>` and `<version>` — human/traceable pinning per release.
- `sha-<short>` — exact commit traceability (FR-004 parity for images).

**Rationale**: preserves today's pull behavior while adding version-pinned tags that didn't
reliably exist before (old flow relied on `metadata-action` seeing a tag ref).

---

## D7. SC-001 timing interpretation

**Decision**: The 5-minute clock in SC-001 is measured **from the moment the automated checks
pass** to the release being visible; the release step itself runs in seconds. Total wall time
from merge = (duration of the existing six-step gate + migrations) + release step.

**Rationale**: FR-006 forbids publishing a release before checks pass, so a literal
"5 minutes from merge" can only hold if the *existing* gate finishes in <4 minutes — that
duration belongs to the current CI, not to this feature. Interpreting the clock from
checks-passed is the only reading consistent with FR-006; SC-009 (production within 15 minutes)
absorbs the full chain including the gate. If the maintainer disagrees, the remedy is gate
duration work, tracked as an out-of-scope follow-up.

---

## D8. package.json version divergence (accepted)

**Decision**: Do **not** add `@semantic-release/npm` or `@semantic-release/git`. `package.json`
`version` stays where it is (currently `3.0.0`) and is not synced to releases.

**Rationale**: there is no npm publish step (constitution), and a git plugin committing a version
bump back to `main` with `GITHUB_TOKEN` would push a commit that triggers no CI run (D4) and
complicates the release window. The field is cosmetic here; the git tag is the version of record.

**Alternative rejected**: syncing via `@semantic-release/git` — post-release commits that CI
never sees, extra races, zero user value.

---

## D9. Contributor contract: Conventional Commits

**Decision**: Document (not enforce via blocking CI) a Conventional Commits contract for commit
messages and squash-merge PR titles: `type(scope)!: description`, types `feat|fix|docs|chore|…`,
breaking changes marked with `!` or a `BREAKING CHANGE:` footer.

**Rationale**: notes quality (FR-005/SC-004) and version correctness (FR-003) depend on it; the
catch-all rule (D2) means a non-conforming message degrades to patch instead of failing the
release, so the contract is a quality lever, not a correctness dependency. History already
follows it. Enforcement (e.g., a PR-title lint job) is optional follow-up, not required by the
spec.

---

## D10. Constitution amendment prerequisite (process gate)

**Decision**: Before implementation merges, the constitution's **Deployment** constraint ("Releases
are cut by pushing a `v*.*.*` tag…") must be amended to describe the new flow
(merge → automatic release → sole publish/deploy path), per the constitution's amendment
procedure — including **explicit maintainer approval of the version bump type**. Recommended:
**MAJOR** (it redefines a non-negotiable deployment rule); the constitution says ambiguous bumps
must be asked, so the maintainer confirms.

**Rationale**: the constitution wins over informal change; implementing FR-010/FR-011 without the
amendment would make the feature non-compliant by definition. Recorded as a Complexity Tracking
row in [plan.md](./plan.md).

**Status — DONE (2026-09-28)**: maintainer signed off **MAJOR** explicitly (constitution §Governance).
`.specify/memory/constitution.md` Deployment section rewritten and versioned **2.0.0**;
AGENTS.md `## Deploy` amended to match. Amendment merges together with this feature's
implementation.

---

## D11. Permissions and secrets (no new secrets)

**Decision**:

- `release.yml`: `contents: write` (semantic-release pushes tag + creates release), plus
  `packages: write`, `attestations: write`, `id-token: write` for the publish job (identical to
  today's `deploy.yml`).
- Secrets: reuse `COOLIFY_WEBHOOK`, `COOLIFY_TOKEN` via `secrets: inherit` on the
  `workflow_call`; `GITHUB_TOKEN` is automatic. Nothing new is committed (FR-012).

**Alternatives considered**: a PAT for the release push — rejected (D4: new credential, FR-012).

---

## D12. No application or schema changes

**Decision**: The feature touches only `.github/workflows/*` and a new release-config file.
No NestJS/TypeORM/entity/migration changes → Principles I–III and V are unaffected; Principle IV
is preserved structurally because the gate job *is* the existing six-step `build.yml`.

**Verification path**: the six CI steps run unchanged as the `gate` job; the new behavior is
validated end-to-end by [quickstart.md](./quickstart.md) scenarios, not by Jest specs (no app
code changed).
