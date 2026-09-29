import type { GamePlatformType } from '../../shared/constants.js';

/** Injection token for `PlatformRuntime[]` — every registered storefront (contracts §3). */
export const PLATFORM_REGISTRY: unique symbol = Symbol('PLATFORM_REGISTRY');

/** Per-definition provider token, e.g. `platform:epic`. */
export function platformToken(type: GamePlatformType): string {
  return `platform:${type}`;
}
