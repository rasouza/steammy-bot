import type { Provider } from '@nestjs/common';
import { GamePlatform } from './platform.constants.js';
import type { EpicApiGame, EpicGame } from './epic/epic.types.js';
import type { Game } from './platform.types.js';
import type { XboxApiGame } from './xbox/xbox.types.js';
import { EpicApi } from './epic/epic.api.js';
import { EpicMapper } from './epic/epic.mapper.js';
import { EpicRepository } from './epic/epic.repository.js';
import { PLATFORM_REGISTRY, platformToken } from './platform.tokens.js';
import type { PlatformDefinition, PlatformRuntime } from './platform.types.js';
import { XboxApi } from './xbox/xbox.api.js';
import { XboxMapper } from './xbox/xbox.mapper.js';
import { XboxRepository } from './xbox/xbox.repository.js';

/**
 * The composition root — registering a storefront is one definition here
 * plus its components (spec FR-001/FR-012, A-002). Announcement messages
 * are configuration, not logic (FR-003).
 */
export const EPIC_PLATFORM: PlatformDefinition<EpicApiGame, EpicGame> = {
  type: GamePlatform.EPIC,
  message: 'New free game available on **Epic Games**',
  api: EpicApi,
  mapper: EpicMapper,
  repository: EpicRepository,
};

export const XBOX_PLATFORM: PlatformDefinition<XboxApiGame, Game> = {
  type: GamePlatform.XBOX,
  message: 'New game available on **Xbox Game Pass**',
  api: XboxApi,
  mapper: XboxMapper,
  repository: XboxRepository,
};

export const platformRegistryProvider: Provider = {
  provide: PLATFORM_REGISTRY,
  inject: [
    platformToken(EPIC_PLATFORM.type),
    platformToken(XBOX_PLATFORM.type),
  ],
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
