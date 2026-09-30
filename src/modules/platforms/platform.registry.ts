import type { Provider } from '@nestjs/common';
import { gameSources } from '../../gamesources/index.js';
import { BroadcastService } from '../broadcast/broadcast.service.js';
import { GenericPlatform } from './generic-platform.js';
import { PLATFORM_REGISTRY, platformToken } from './platform.tokens.js';
import type { Game } from './platform.types.js';
import type {
  PlatformApi,
  PlatformDefinition,
  PlatformMapper,
  PlatformRepository,
  PlatformRuntime,
} from './platform.types.js';

/**
 * The composition root — the only file in the machinery that reaches into
 * `src/gamesources/`, through the central registration list (SC-003,
 * research R2). Registration data (keys, names, definitions, components)
 * lives in the platform folders; this file derives providers from the list
 * generically and never names a platform (spec FR-001).
 */

/**
 * Wires one definition into a `PlatformRuntime` provider (contracts §3).
 * Composition only — no lifecycle logic (folded in from the retired
 * platform.factory.ts, research R3).
 */
function createPlatformProvider(
  definition: PlatformDefinition<unknown, Game>,
): Provider {
  return {
    provide: platformToken(definition.type),
    inject: [
      definition.api,
      definition.mapper,
      definition.repository,
      BroadcastService,
    ],
    useFactory: (
      api: PlatformApi<unknown>,
      mapper: PlatformMapper<unknown, Game>,
      repository: PlatformRepository<Game>,
      broadcast: BroadcastService,
    ): PlatformRuntime =>
      new GenericPlatform(definition, api, mapper, repository, broadcast),
  };
}

/** Components + runtime providers for every registered GameSource. */
export const platformProviders: Provider[] = gameSources.flatMap(
  (definition) => [
    definition.api,
    definition.mapper,
    definition.repository,
    createPlatformProvider(definition),
  ],
);

export const platformRegistryProvider: Provider = {
  provide: PLATFORM_REGISTRY,
  inject: gameSources.map((definition) => platformToken(definition.type)),
  useFactory: (...runtimes: PlatformRuntime[]): PlatformRuntime[] => {
    // Duplicate or broken registration must fail fast at startup
    // (spec Edge Cases): two definitions of the same type resolve to the
    // same provider token, so the registry sees the runtime twice.
    const types = runtimes.map((runtime) => runtime.type);
    if (new Set(types).size !== types.length) {
      throw new Error(`Duplicate platform registration: ${types.join(', ')}`);
    }

    return runtimes;
  },
};
