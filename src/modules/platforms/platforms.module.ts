import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogEpic, CatalogXbox } from '../../database/entities/index.js';
import { BroadcastModule } from '../broadcast/broadcast.module.js';
import { EpicApi } from './epic/epic.api.js';
import { EpicMapper } from './epic/epic.mapper.js';
import { EpicRepository } from './epic/epic.repository.js';
import { createPlatformProvider } from './platform.factory.js';
import {
  EPIC_PLATFORM,
  XBOX_PLATFORM,
  platformRegistryProvider,
} from './platform.registry.js';
import { PlatformScheduler } from './platform.scheduler.js';
import { PLATFORM_REGISTRY } from './platform.tokens.js';
import { XboxApi } from './xbox/xbox.api.js';
import { XboxMapper } from './xbox/xbox.mapper.js';
import { XboxRepository } from './xbox/xbox.repository.js';

/**
 * Composition root for storefronts: per-platform components, one factory
 * provider per definition, the shared registry, and the generic scheduler.
 * Adding a storefront = its three components + one definition entry — no
 * edits to this module's generic wiring (spec FR-001).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([CatalogEpic, CatalogXbox]),
    BroadcastModule,
  ],
  providers: [
    EpicApi,
    EpicMapper,
    EpicRepository,
    XboxApi,
    XboxMapper,
    XboxRepository,
    createPlatformProvider(EPIC_PLATFORM),
    createPlatformProvider(XBOX_PLATFORM),
    platformRegistryProvider,
    PlatformScheduler,
  ],
  exports: [PLATFORM_REGISTRY, PlatformScheduler],
})
export class PlatformsModule {}
