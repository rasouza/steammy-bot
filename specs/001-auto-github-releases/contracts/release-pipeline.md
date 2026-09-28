# Contract: Release Pipeline Workflow Interfaces

**Consumers**: `release.yml` (orchestrator), `build.yml` (CI), `deploy.yml` (publisher)
**Research basis**: D3–D5, D11 in [research.md](../research.md)

The feature is implemented as three workflow interfaces. This contract fixes their boundaries so
that adding/removing a trigger or step later cannot silently violate FR-006, FR-010, or FR-011.

---

## 1. `build.yml` — CI (quality interface)

| Aspect        | Contract                                                                 |
|---------------|--------------------------------------------------------------------------|
| Triggers      | `pull_request`, `workflow_dispatch`, **`workflow_call`**. **No `push: branches: [main]`** (moved into `release.yml` to avoid duplicate main CI — research D3). **No tag triggers.** |
| Steps         | Unchanged six-step CI sequence + migrations job (constitution IV)         |
| Output        | Job success == checks passed; consumed by `release.yml` `ci` job         |
| Changes allowed? | None to step content. Trigger list change as specified above only.      |

## 2. `release.yml` — orchestrator (new)

| Aspect        | Contract                                                                 |
|---------------|----------|
| Trigger       | `push: branches: [main]` only (covers direct pushes and PR merges)       |
| Concurrency   | `group: release-main`, `cancel-in-progress: false` (FR-008 — serialized)  |
| Job graph     | `ci` → `release` → `publish` (`publish` also `needs: ci`)                 |
| Job `ci`      | `uses: ./.github/workflows/build.yml`                                     |
| Job `release` | checkout `fetch-depth: 0` **and** explicit `git fetch --force --tags` (research D5); runs `cycjimmy/semantic-release-action@v6` with `GITHUB_TOKEN` env |
| Job outputs   | `release.new_release_published` (`'true'|'false'`), `release.new_release_version`, `release.new_release_git_tag` |
| Job `publish` | `if: needs.release.outputs.new_release_published == 'true'`; calls `deploy.yml` with `secrets: inherit` and `with.version`/`with.git_tag` |
| Permissions   | Job-scoped (least privilege): workflow baseline `contents: read`; `release` job elevates to `contents: write`; `publish` job sets `contents: read`, `packages: write`, `attestations: write`, `id-token: write` (job-level `permissions` replaces the workflow-level set, so `contents: read` must be restated). `ci` needs only the baseline. |
| Failure rule  | Any stage failing fails the run visibly (FR-009). A run must never create two releases (FR-007). |

## 3. `deploy.yml` — publisher (narrowed interface)

| Aspect        | Contract                                                                 |
|---------------|--------------------------------------------------------------------------|
| Triggers      | **`workflow_call` only.** `push: tags` and `workflow_dispatch` are **removed** (FR-011, SC-008, research D4). |
| Inputs        | `version` (e.g. `3.0.1`), `git_tag` (e.g. `v3.0.1`) — required            |
| Secrets       | `COOLIFY_WEBHOOK`, `COOLIFY_TOKEN` (via `secrets: inherit` — no new secrets, FR-012) |
| Steps         | Unchanged: checkout → ghcr login → metadata → buildx → multi-arch push → attest → Coolify ping |
| Image tags    | `latest` (required by `docker-compose.yml:8`), `v<version>`, `<version>`, `sha-<short>` — built from inputs, **not** from `github.ref` (research D6) |
| Invariant     | This is the **only** place in the repository that pushes to the container registry (FR-011, SC-008) |

---

## Cross-cutting invariants (enforced by this contract)

1. **No event-based deploy**: no workflow may trigger on tag push or on release creation events —
   token-created events do not fire workflows (GitHub recursion rule), and human-created ones must
   not deploy (FR-011).
2. **Gate before release before image**: `images ⊆ releases ⊆ check-passing merges` (data model
   invariant).
3. **Single chain on main**: exactly one workflow reacts to a push to `main` (`release.yml`);
   it runs the gate exactly once.
4. **Version flow**: version exists only as an output of the `release` job and flows downward as
   `with.version` — nothing recomputes or hardcodes it.
5. **Permissions stay scoped**: no PAT/App token (FR-012); `GITHUB_TOKEN` only.
