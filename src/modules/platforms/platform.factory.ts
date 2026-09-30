import type { Provider } from '@nestjs/common';
import type { Game } from './platform.types.js';
import { BroadcastService } from '../broadcast/broadcast.service.js';
import { GenericPlatform } from './generic-platform.js';
import { platformToken } from './platform.tokens.js';
import type {
  PlatformApi,
  PlatformDefinition,
  PlatformMapper,
  PlatformRepository,
  PlatformRuntime,
} from './platform.types.js';

/**
 * Wires one definition into a `PlatformRuntime` provider (contracts §3).
 * Composition only — no lifecycle logic.
 */
export function createPlatformProvider<TSource, TGame extends Game>(
  definition: PlatformDefinition<TSource, TGame>,
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
      api: PlatformApi<TSource>,
      mapper: PlatformMapper<TSource, TGame>,
      repository: PlatformRepository<TGame>,
      broadcast: BroadcastService,
    ): PlatformRuntime =>
      new GenericPlatform(definition, api, mapper, repository, broadcast),
  };
}
