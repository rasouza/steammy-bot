/**
 * Platform lifecycle contracts — the stable seams a new GameSource plugs into
 * (specs/003-easy-add-platform/contracts/platform-contracts.md).
 *
 * `PlatformRepository` gained five dev-reset primitives in
 * specs/006-dev-smoke-commands/contracts/dev-command-contracts.md §3, and
 * `BroadcastPort.send` gained the optional `recipient` of §4. Both documents
 * describe this file's surface; the 006 contracts are authoritative for the
 * members they added.
 *
 * Design-level interfaces: `GenericPlatform` is the only `PlatformRuntime`
 * implementation; each GameSource provides its own Api/Mapper/Repository.
 * No lifecycle logic lives here (spec FR-003). The machinery never imports
 * the domain keys — definition keys are plain strings (SC-003).
 */

import type { Type } from '@nestjs/common';

/**
 * Common game model — the contracts' `TGame` (the producer side owns the
 * model; moved from the retired shared types folder, research R11). `broadcasted` is
 * deliberately absent: mappers never see announcement state (spec FR-001).
 */
export interface Game {
  id: string;
  title: string;
  developer?: string | null;
  description: string;
  image?: string | null;
  price?: number | null;
  size?: number | null;
}

/** Fetch — returns the platform's NATIVE shape, never an entity. */
export interface PlatformApi<TSource> {
  fetch(): Promise<TSource[]>;
}

/**
 * Translate — native shape → common game model, no persistence.
 * `null` means the source does not qualify for this platform and must not
 * be persisted (e.g. an upcoming/discount filter, spec FR-002).
 */
export interface PlatformMapper<TSource, TGame> {
  toGame(source: TSource): TGame | null;
}

/**
 * Persistence + eligibility — the platform's own rules live here (FR-005).
 *
 * The last five members are the dev-reset seam
 * (specs/006-dev-smoke-commands/contracts/dev-command-contracts.md §3).
 * Adding a platform means implementing all eight alongside it, with no edit
 * to generic code (rule R-3.4).
 */
export interface PlatformRepository<TGame> {
  /** Upsert by id; the `broadcasted` flag is never written here (FR-001 / clarification Q2). */
  saveAll(games: TGame[]): Promise<void>;
  /** Loads only rows matching this GameSource's criteria (research R5). */
  findPending(now: Date): Promise<TGame[]>;
  /** Called ONLY after delivery succeeded (Constitution II / spec FR-009). */
  markBroadcasted(game: TGame): Promise<void>;

  /**
   * One row this platform would allow announcing, `broadcasted` ignored,
   * ordered by primary key ascending. `null` when nothing qualifies.
   *
   * Eligibility stays inside the platform — the same criteria `findPending`
   * uses, never reconstructed by generic code (rule R-3.1).
   */
  findDevCandidate(now: Date): Promise<TGame | null>;

  /**
   * Marks every row matching this platform's pending criteria except
   * `candidate` as announced. Returns how many rows it suppressed.
   *
   * Moves rows `false → true` without a send — permitted only by
   * Constitution II's operator dev-reset carve-out, and only because the
   * caller reports the count (FR-015).
   */
  markBroadcastedExcept(candidate: TGame, now: Date): Promise<number>;

  /** Sets `broadcasted = false` for exactly one row. Idempotent. */
  markPending(game: TGame): Promise<void>;

  /**
   * Deletes every row in this platform's catalog.
   *
   * Unconditional and whole-catalog: takes no `now` (rule R-3.3), and is
   * used only by the dev reset.
   */
  clear(): Promise<void>;

  /**
   * Sets `broadcasted = true` for every row in this platform's catalog.
   * Returns the number of rows affected.
   *
   * Unconditional and whole-catalog: takes no `now` (rule R-3.3). Same
   * carve-out and reporting obligation as `markBroadcastedExcept`.
   */
  markAllBroadcasted(): Promise<number>;
}

/** Registration record — configuration only (spec FR-003). */
export interface PlatformDefinition<
  TSource,
  TGame,
  TKey extends string = string,
> {
  type: TKey;
  name: string;
  message: string;
  api: Type<PlatformApi<TSource>>;
  mapper: Type<PlatformMapper<TSource, TGame>>;
  repository: Type<PlatformRepository<TGame>>;
}

/** What the scheduler and admin commands see — one generic implementation (research R1). */
export interface PlatformRuntime {
  readonly type: string;
  /** fetch → map → saveAll; errors are caught per platform by the scheduler. */
  sync(): Promise<void>;
  /** findPending → send → mark; returns the number of games announced. */
  broadcastPending(): Promise<number>;

  /**
   * Dev smoke: one delivery per platform into `recipient`, surplus suppressed
   * (contracts §4, research R6). Never called by the scheduler or `/broadcast`
   * — only by `/dev broadcast`.
   */
  devBroadcast(recipient: string): Promise<DevBroadcastOutcome>;
}

/**
 * What one `/dev broadcast` pass reports for a platform — the three things
 * the reply is obliged to state (contracts §5, FR-007 / FR-015).
 */
export interface DevBroadcastOutcome {
  /** Games that reached the invocation channel. */
  delivered: number;
  /** Pending rows marked announced without being delivered (FR-015). */
  suppressed: number;
  /** Nothing eligible to deliver — reported as skipped, not as failure (FR-007). */
  skipped: boolean;
}

/** Result of one delivery pass — enables FR-010's mark rule (research R3). */
export interface SendOutcome {
  /** Channels that accepted the message. */
  delivered: number;
  /** Total subscriptions resolved for the platform (`0` ⇒ caller treats as success per A-005). */
  subscribers: number;
}

/** The delivery surface the lifecycle depends on (contracts §4). */
export interface BroadcastPort<TGame> {
  /**
   * The single send — there is no second sender (FR-012).
   *
   * `recipient` (contracts §4, rule R-4.1) is an *input* to this send, not a
   * fork around it: when supplied, exactly that channel is fetched and no
   * `subscription` query runs; when absent, behaviour is unchanged and the
   * subscriptions resolve the audience as before. `devBroadcast` is the only
   * caller that passes it (rule R-4.2).
   */
  send(
    message: string,
    game: TGame,
    platform: string,
    recipient?: string,
  ): Promise<SendOutcome>;
}
