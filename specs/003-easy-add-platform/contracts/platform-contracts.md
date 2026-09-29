# Phase 1 Contracts: Platform Lifecycle Interfaces

**Branch**: `003-easy-add-platform` | **Date**: 2026-09-29
**Input**: [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./../data-model.md)

These are the internal interfaces the refactor turns into stable seams — the exact surface the
FR-018 integration guide (`docs/platform-integration.md`) will document for a new storefront.
Signatures are design-level (the implementing file is `src/modules/platforms/platform.types.ts`).
All files import types with explicit ESM extensions and `import type`.

---

## 1. Storefront components (per-storefront, implement once per platform)

```ts
// PlatformApi — fetch: returns the platform's NATIVE shape, never an entity
interface PlatformApi<TSource> {
  fetch(): Promise<TSource[]>;
}
// Implemented by EpicApi (EpicApiGame[]), XboxApi (XboxApiGame[]).

// PlatformMapper — translate: native shape → common Game model, no persistence
interface PlatformMapper<TSource, TGame> {
  toGame(source: TSource): TGame;
}
// Implemented by EpicMapper (EpicApiGame → EpicGame), XboxMapper (XboxApiGame → Game).

// PlatformRepository — persistence + eligibility (the platform's own rules)
interface PlatformRepository<TGame> {
  saveAll(games: TGame[]): Promise<void>;        // upsert by id; flag untouched (R6)
  findPending(now: Date): Promise<TGame[]>;      // uses this platform's criteria (R5)
  markBroadcasted(game: TGame): Promise<void>;   // called ONLY after delivery succeeds
}
```

**Criteria functions** (unit-tested pure functions, spec FR-016 / plan §15):

```ts
// epic.repository.ts
function epicPendingCriteria(now: Date): { broadcasted: false; offer_start_at: <= now; offer_end_at: >= now };
// xbox.repository.ts
function xboxPendingCriteria(now: Date): { broadcasted: false };
```

Contract rules:
- `findPending` MUST NOT load rows outside the storefront's criteria.
- Generic code MUST NOT contain, import, or reconstruct these criteria (FR-005).
- `saveAll` MUST NOT write the `broadcasted` column (FR-001 / clarification Q2).

---

## 2. Registration (composition root — the only file a new storefront edits besides its own)

```ts
interface PlatformDefinition<TSource, TGame> {
  type: GamePlatformType;                 // identity + provider token base
  message: string;                        // announcement text (config only, FR-003)
  api: Type<PlatformApi<TSource>>;
  mapper: Type<PlatformMapper<TSource, TGame>>;
  repository: Type<PlatformRepository<TGame>>;
}

// Existing entries, verbatim current behavior:
// EPIC_PLATFORM  = { type: GamePlatform.EPIC,  message: 'New free game available on **Epic Games**',    api: EpicApi,    mapper: EpicMapper,    repository: EpicRepository }
// XBOX_PLATFORM  = { type: GamePlatform.XBOX,  message: 'New game available on **Xbox Game Pass**',     api: XboxApi,    mapper: XboxMapper,    repository: XboxRepository }
```

---

## 3. Runtime (one generic implementation, constructed by factory providers)

```ts
// The common shape the scheduler/admin see — NOT a class hierarchy (R1, plan §13)
interface PlatformRuntime {
  readonly type: GamePlatformType;
  sync(): Promise<void>;              // fetch → map → saveAll; per-storefront errors caught by scheduler
  broadcastPending(): Promise<number>;// findPending → send → mark; returns count ANNOUNCED
}

// GenericPlatform<TSource, TGame> implements PlatformRuntime.
// Constructor: (definition, api, mapper, repository, broadcast) — direct-constructible in specs.

const PLATFORM_REGISTRY: unique symbol; // inject token → PlatformRuntime[] (all registrations)
function platformToken(type: GamePlatformType): string; // e.g. 'platform:epic' per-definition token
function createPlatformProvider(definition): Provider;  // useFactory + inject [api, mapper, repository, BroadcastService]
```

**Lifecycle ordering contract** (the Constitution II invariant, spec FR-009):

```text
game = mapper.toGame(source)            // per fetched source
repository.saveAll(...)                 // sync path

games = repository.findPending(now)     // announce path
{ delivered, subscribers } = broadcast.send(def.message, game, def.type)   // FIRST
if (delivered > 0 || subscribers === 0) repository.markBroadcasted(game)   // THEN
else log + leave pending (retry next pass)
```

No `if (type === ...)` anywhere above the storefront components (FR-005).

---

## 4. Delivery port (what `BroadcastService` must expose after slimming)

```ts
// broadcast.service.ts — delivery ONLY: no catalog entities, no eligibility, no crons (FR-006)
class BroadcastService {
  send(message: string, game: Game, platform: GamePlatformType): Promise<SendOutcome>;
  // SendOutcome = { delivered: number; subscribers: number }  (defined in platform.types.ts)
  //  delivered  = number of subscribed channels that accepted the message.
  //  subscribers = total subscriptions resolved for the platform (one query inside send).
  //  Per-channel failures: caught + logged inside send (today's semantics), counted as not-delivered.
  //  Zero subscribers → { delivered: 0, subscribers: 0 } (caller treats as success per A-005).
  //  Throws only on failures OUTSIDE the per-channel loop (subscription query, embed build).
}
```

Removed from this class (FR-014): `Repository<CatalogEpic>`, `Repository<CatalogXbox>`,
`cronEpic()`, `cronXbox()`, `broadcastEpic()`, `broadcastXbox()`.

Caller-success rule (FR-010): `delivered > 0 || subscribers === 0` ⇒ mark; otherwise pending.
Both numbers come from one return value — a bare count could not distinguish "nobody subscribed"
(A-005, mark) from "every send failed" (FR-010, leave pending).

---

## 5. Scheduling contract

```ts
class PlatformScheduler {
  @Cron('0 * * * *')  syncAll(): Promise<void>;       // today's sync timing (A-003)
  @Cron('10 * * * *') broadcastAll(): Promise<number>;// today's announce timing (A-003)
  // Both: for (const p of registry) { try { await p.run() } catch { log; continue } } (Q1, FR-004)
}
```

No storefront imports, no platform branching in this class.

---

## 6. Admin command contract (spec FR-011, A-002)

```text
/sync    <platform> → registry[type].sync()          → editReply '<Name> catalog synchronized successfully.' | 'Failed to sync <Name>: ...'
/broadcast <platform> → registry[type].broadcastPending() → editReply 'Broadcasted <count> games for <Name>.' | 'Failed to broadcast <Name>: ...'
```

Wording, ephemeral flags, and `GamePlatformName` lookups unchanged (FR-015); `count` =
games successfully announced (R8). Missing/unknown platform ⇒ existing DTO `choices` prevent
it; duplicate or broken registration ⇒ fail fast at startup (Edge Cases).

---

## 7. Configuration contract (spec FR-013, A-007; research R4)

```text
BROADCAST_ENABLED ∈ {'true','false'}   default 'true' (production-safe)
  true  → announce pass sends and marks as above
  false → announce pass performs NO sends and marks NOTHING; sync pass unaffected
```

Added to `envSchema` (stays `.passthrough()`); documented in `.env.example`; not injected by
`docker-compose.yml` (default keeps production behavior byte-identical).

---

## 8. Contract tests (what proves each seam — FR-016)

| Contract | Test (colocated `src/**/*.spec.ts`) |
|----------|--------------------------------------|
| GenericPlatform sync | fake api returns sources → mapper called per source → repository.saveAll receives mapped games |
| GenericPlatform announce success | pending games → send called with definition message/type → markBroadcasted called → count returned |
| GenericPlatform announce failure | send throws / returns 0 with subscribers → markBroadcasted NOT called |
| GenericPlatform empty queue | repository returns `[]` → no send, returns 0 |
| Epic criteria | started/expired/active/announced × 4 date cases (plan §15) |
| Xbox criteria | pending iff un-announced |
| Scheduler isolation | one runtime throws → others still invoked (Q1) |
| E2E smoke | `test/health.e2e-spec.ts` unchanged and passing |
