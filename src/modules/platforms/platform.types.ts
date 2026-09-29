/**
 * Platform lifecycle contracts — the stable seams a new storefront plugs into
 * (specs/003-easy-add-platform/contracts/platform-contracts.md).
 *
 * Design-level interfaces: `GenericPlatform` is the only `PlatformRuntime`
 * implementation; each storefront provides its own Api/Mapper/Repository.
 * No lifecycle logic lives here (spec FR-003).
 */

import type { Type } from '@nestjs/common';
import type { GamePlatformType } from './platform.constants.js';

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
 * `null` means the source does not qualify for this storefront and must not
 * be persisted (e.g. Epic's upcoming/discount filter, spec FR-002).
 */
export interface PlatformMapper<TSource, TGame> {
  toGame(source: TSource): TGame | null;
}

/** Persistence + eligibility — the platform's own rules live here (FR-005). */
export interface PlatformRepository<TGame> {
  /** Upsert by id; the `broadcasted` flag is never written here (FR-001 / clarification Q2). */
  saveAll(games: TGame[]): Promise<void>;
  /** Loads only rows matching this storefront's criteria (research R5). */
  findPending(now: Date): Promise<TGame[]>;
  /** Called ONLY after delivery succeeded (Constitution II / spec FR-009). */
  markBroadcasted(game: TGame): Promise<void>;
}

/** Registration record — configuration only (spec FR-003). */
export interface PlatformDefinition<TSource, TGame> {
  type: GamePlatformType;
  message: string;
  api: Type<PlatformApi<TSource>>;
  mapper: Type<PlatformMapper<TSource, TGame>>;
  repository: Type<PlatformRepository<TGame>>;
}

/** What the scheduler and admin commands see — one generic implementation (research R1). */
export interface PlatformRuntime {
  readonly type: GamePlatformType;
  /** fetch → map → saveAll; errors are caught per storefront by the scheduler. */
  sync(): Promise<void>;
  /** findPending → send → mark; returns the number of games announced. */
  broadcastPending(): Promise<number>;
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
  send(
    message: string,
    game: TGame,
    platform: GamePlatformType,
  ): Promise<SendOutcome>;
}
