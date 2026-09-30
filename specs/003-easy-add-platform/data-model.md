# Phase 1 Data Model: Easy Add Platform — Generic Platform Lifecycle

**Branch**: `003-easy-add-platform` | **Date**: 2026-09-29
**Input**: [spec.md](./spec.md), [research.md](./research.md)

**Schema change: NONE.** All entities below already exist exactly as shown; this feature adds
no columns, no tables, and no migrations (spec FR-017, A-006, Constitution III). What changes
is *which component* owns reading/writing them.

---

## Entities (as stored today)

### CatalogEpic (`catalog_epic`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | varchar(255), PK | Epic offer id — upsert key |
| `title` | varchar(255) | |
| `price` | bigint, nullable | **cents**; pg returns string ⇒ `Number()` before arithmetic |
| `size` | bigint, nullable | bytes; same coercion rule |
| `developer` | varchar(255), nullable | |
| `image` | varchar(255), nullable | thumbnail URL |
| `description` | text | |
| `broadcasted` | boolean, default `false` | the announced flag — see State Transitions |
| `offer_start_at` | timestamptz | eligibility input |
| `offer_end_at` | timestamptz | eligibility input |
| `createdAt` / `updatedAt` | timestamptz | managed columns |

### CatalogXbox (`catalog_xbox`)

Identical to `CatalogEpic` **minus** `offer_start_at` / `offer_end_at` (Xbox eligibility never
consults an offer window — spec FR-008).

### Subscription (`subscription`)

| Field | Type | Notes |
|-------|------|-------|
| `id` | varchar(255), PK part | Discord channel id |
| `platform` | varchar(255), PK part | matches `GamePlatform` values (`'epic'`, `'xbox'`) |
| `guildId` | varchar(255), PK part, FK → `guild` | cascade delete |
| `createdAt` / `updatedAt` | timestamptz | |

Relationship: `Guild 1 — * Subscription`. Delivery resolves `Subscription` rows by
`platform = <definition.type>` to choose target channels (spec FR-006).

---

## In-memory shapes (no persistence change)

### `Game` (common game model — `src/modules/platforms/platform.types.ts` after the R11 move; shape unchanged)

`id`, `title`, `developer?`, `description`, `image?`, `price?` (cents), `size?` (bytes).
Epic-specific extension `EpicGame` adds `offer_start_at`, `offer_end_at`, `offer`.

Note: `Game` does **not** carry `broadcasted` — mappers produce `Game`-shaped payloads that
are persisted into per-storefront entities whose defaults keep `broadcasted = false` for new
rows and which **never write** the flag during sync (spec FR-001/Q2).

### `PlatformDefinition` (registration record — new, configuration only)

| Field | Type | Role |
|-------|------|------|
| `type` | `GamePlatformType` | identity; also the provider token base |
| `message` | `string` | announcement text, e.g. `'New free game available on **Epic Games**'` |
| `api` | class token → `PlatformApi<TSource>` | fetch |
| `mapper` | class token → `PlatformMapper<TSource, TGame>` | translate |
| `repository` | class token → `PlatformRepository<TGame>` | persist + eligibility |

No lifecycle logic in the definition (spec FR-003).

---

## State Transitions

### `broadcasted` flag (the only state machine in this feature)

```text
              sync re-fetch (upsert by id, flag not written)
                        │
                        ▼
   ┌─────────────── false (pending) ◄──┐
   │                                  │
   │ announce pass:                   │ announce pass:
   │ send() → delivered > 0           │ send() → delivered = 0
   │   OR zero subscribers            │   with N ≥ 1 subscribers
   ▼                                  │ (error caught; NOT marked)
 true (announced) ────────────────────┘
   │                                  ▲
   └── terminal: never reset ─────────┘  (no path back to false)
```

Rules (spec FR-009/FR-010, A-004, A-005):

- **false → true** only after `send()` reports success: at least one subscribed channel
  accepted the message, **or** the storefront has zero subscribers (nothing to deliver).
- **false → false** when every attempted delivery fails (or `send` throws): the game stays
  pending; the next scheduled pass retries it.
- **true is terminal**: neither sync, admin commands, nor any failure path resets it.
- One transition per game per pass at most; a game already `true` is never selected again
  (it fails the pending criteria).

### Eligibility selection (input to the state machine)

| Storefront | Selected iff (spec FR-007/FR-008) |
|------------|-----------------------------------|
| Epic | `broadcasted = false` **AND** `offer_start_at ≤ now` **AND** `offer_end_at ≥ now` |
| Xbox | `broadcasted = false` |

Each rule is a pure criteria function owned by that storefront's repository component —
never expressed in generic code (research R5, spec FR-005).

---

## Persistence operations (owned by platform repositories)

| Operation | Semantics | Owner |
|-----------|-----------|-------|
| `saveAll(games)` | `upsert(games, ['id'])` — update in place, no duplicates, flag untouched | platform repository (research R6) |
| `findPending(now)` | filtered select using the storefront's criteria function | platform repository |
| `markBroadcasted(game)` | set `broadcasted = true`, save — **called only post-delivery** | platform repository |

Validation rules carried over unchanged: Epic rows require both offer-window timestamps;
`price`/`size` are bigint ⇒ `Number()` before any arithmetic (Constitution, Data
representation); upsert key is the storefront game `id` (varchar 255 PK).
