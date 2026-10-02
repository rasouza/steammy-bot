> **Status: historical.** Describes the fixture set and dry-run report entities of the original design, superseded by the e2e-suite redesign on 2026-10-01 (spec.md Clarifications). The fixtures now live in `test/fixtures/`.
# Phase 1 Data Model: Dev/Test Environment (005-dev-test-environment)

**Date**: 2026-09-30 | **Spec**: [spec.md](./spec.md) | **Research**: [research.md](./research.md)

**No new entities, no schema changes, no migrations** (Constitution III — the
feature only *writes rows* into existing tables and *reads* them back).

## Existing entities (unchanged shape)

### `catalog_epic` — `CatalogEpic`

| Field | Type | Constraints | Fixture relevance |
|-------|------|-------------|-------------------|
| `id` | varchar(255) | PK | fixed ids `dev-fixture-epic-1/2` |
| `title` | varchar(255) | required | `"Dev Fixture Epic …"` |
| `price` | bigint, nullable | pg returns string → `Number()` before arithmetic | set (cents) to exercise embed math |
| `size` | bigint, nullable | same | set |
| `developer` | varchar(255), nullable | | set |
| `image` | varchar(255), nullable | | `null` acceptable |
| `description` | text | required | short literal |
| `broadcasted` | boolean, default false | **the delivery flag** (Constitution II) | seeded `false`; seed resets it to `false` |
| `offer_start_at` | timestamptz, required | eligibility window start | `now − 1 day` at seed time |
| `offer_end_at` | timestamptz, required | eligibility window end | `now + 30 days` at seed time |

### `catalog_xbox` — `CatalogXbox`

Same as Epic minus the offer-window columns. Eligibility is
`broadcasted: false` only (`xboxPendingCriteria`), so fixtures need no window.

### `guild` — `Guild`

| Field | Type | Constraints | Fixture relevance |
|-------|------|-------------|-------------------|
| `id` | varchar(255) | PK | one row for `TEST_GUILD_ID`; one synthetic `dev-stale-guild` row |
| `prefix` | varchar(255), nullable | | `null` |
| `deleted` | boolean, default false | soft-delete flag | `false` for the test guild, `true` for `dev-stale-guild` |
| `last_interact` | timestamptz, default now | | default |
| `created_at` / `updated_at` | timestamptz | auto | auto |

### `subscription` — `Subscription`

| Field | Type | Constraints | Fixture relevance |
|-------|------|-------------|-------------------|
| `id` | varchar(255) | **PK part 1** = Discord channel id | `TEST_CHANNEL_ID` (live), `<stale-channel>` (stale) |
| `platform` | varchar(255) | **PK part 2** | one row per entry in `gameSources` (live), `xbox` for stale |
| `guild_id` | varchar(255) | **PK part 3**, FK → `guild.id` `ON DELETE CASCADE` | test guild (live), `dev-stale-guild` (stale) |
| `created_at` / `updated_at` | timestamptz | auto | auto |

Composite PK makes duplicate subscriptions impossible by construction (FR-007
"no duplicate rows" is guaranteed, then asserted).

## Fixture set (the baseline)

Defined as pure data in `src/dev/fixtures.ts`; applied idempotently by
`dev:seed` (upsert by PK + reset `broadcasted = false` on fixture ids only).

```text
Fixture set
├── guild:        { id: TEST_GUILD_ID, deleted: false }
├── guild:        { id: "dev-stale-guild", deleted: true }        ← FR-008
├── subscriptions (live): one per platform ∈ gameSources
│     { id: TEST_CHANNEL_ID, platform, guildId: TEST_GUILD_ID }
├── subscription (stale): { id: "<stale-channel>", platform: "xbox",
│                          guildId: "dev-stale-guild" }            ← FR-008
├── catalog_xbox: ≥1 rows, ids "dev-fixture-xbox-*", broadcasted=false
└── catalog_epic: ≥1 rows, ids "dev-fixture-epic-*", broadcasted=false,
                  window spans seed time (epicPendingCriteria accepts them)
```

**Validation rules (enforced by seed / asserted by specs)**

1. Every fixture id starts with `dev-` — the reset step touches *only* these
   rows, so manually synced real rows are never modified (R6).
2. Live subscriptions: one per platform from `gameSources`, all pointing at
   `TEST_CHANNEL_ID` in the test guild (FR-006; platform list is never
   hardcoded — Constitution I).
3. Stale subscription's guild has `deleted = true` (FR-008).
4. All catalog fixtures have `broadcasted = false` (FR-006) and satisfy their
   platform's pending criteria at seed time (Epic window rule).
5. No fixture row references a guild other than `TEST_GUILD_ID` or
   `dev-stale-guild`.
6. Seed writes nothing unless the Discord REST check confirms the bot is in
   `TEST_GUILD_ID` and `TEST_CHANNEL_ID` is a text channel there (US3.3).

## State transitions

```text
catalog fixture row:
  broadcasted=false ──real pass, ≥1 channel delivered──▶ broadcasted=true   (Constitution II)
  broadcasted=true  ──dev:seed (fixture ids only)──────▶ broadcasted=false  (FR-007 reset)
  broadcasted=false ──dry-run / preview────────────────▶ broadcasted=false  (FR-011: NO transition)
  broadcasted=false ──real pass, 0 delivered, >0 subs──▶ broadcasted=false  (stays pending, existing rule)

guild row:
  deleted=false ──bot leaves (existing behavior)──▶ deleted=true
  deleted=false ──dev:seed (TEST_GUILD_ID)────────▶ deleted=false  (baseline restore)
  dev-stale-guild: deleted=true always (never reset)

subscription / guild rows: no lifecycle in this feature — created/reset by
seed, read by preview/send. Never deleted.
```

**Invariants the checks rely on**

- After `dev:verify` step 5 (dry-run): every fixture row still
  `broadcasted = false`, row counts unchanged → **the dry-run satisfied no
  delivery flag** (FR-011, verified as check step 6).
- Between two `dev:seed` runs: identical row counts, identical fixture ids
  (US3.2 / SC-008).
- A dry-run over seeded state always yields: ≥1 candidate per platform,
  ≥1 `deliver` decision, ≥1 `skip` decision with reason `guild … no longer
  served` (US3.4, US5.1).

## Relationships (text diagram)

```text
guild 1 ──── * subscription        (guild_id FK, CASCADE on hard delete only)
subscription.id (channel) ──── * broadcast target decisions in a DryRunReport
catalog_epic / catalog_xbox ── independent of guild/subscription; joined only
                               at broadcast time via subscription.platform
```

## Dry-run report & check verdict (ephemeral, not stored)

Neither is written to the database — they are process output. Schemas:
[contracts/dry-run-report.schema.json](./contracts/dry-run-report.schema.json),
[contracts/check-result.schema.json](./contracts/check-result.schema.json).
