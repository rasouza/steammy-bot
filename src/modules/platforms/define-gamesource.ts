import type { Type } from '@nestjs/common';
import type {
  Game,
  PlatformApi,
  PlatformDefinition,
  PlatformMapper,
  PlatformRepository,
} from './platform.types.js';

/**
 * Declarative registration spec a GameSource folder hands to the framework
 * (specs/004-platform-gamesource-split/contracts/define-gamesource.md §1).
 * Pure data: the helper never instantiates, registers, or performs I/O, and
 * this file imports nothing from `src/gamesources/` — the key is generic, so
 * the machinery stays a leaf importer (SC-003, research R2).
 */
export interface GameSourceSpec<
  TSource,
  TGame extends Game,
  TKey extends string,
> {
  /** Domain key of the platform — a plain string literal; the registered definitions together form the key union. */
  platform: TKey;
  /** Display name used by command replies and lifecycle logs. */
  name: string;
  /** Announcement template — configuration, not logic (spec FR-003). */
  message: string;
  api: Type<PlatformApi<TSource>>;
  mapper: Type<PlatformMapper<TSource, TGame>>;
  repository: Type<PlatformRepository<TGame>>;
}

/**
 * Turns a declaration into the definition object the registry consumes —
 * `platform` surfaces to the machinery as the definition's `type` key.
 * Compile-time only: no runtime validation is added (FR-005).
 */
export function defineGameSource<
  TSource,
  TGame extends Game,
  TKey extends string,
>(
  spec: GameSourceSpec<TSource, TGame, TKey>,
): PlatformDefinition<TSource, TGame, TKey> {
  const { platform, ...definition } = spec;
  return { type: platform, ...definition };
}
