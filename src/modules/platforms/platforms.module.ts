import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { entities } from '../../database/data-source-options.js';
import { BroadcastModule } from '../broadcast/broadcast.module.js';
import {
  platformProviders,
  platformRegistryProvider,
} from './platform.registry.js';
import { PlatformScheduler } from './platform.scheduler.js';
import { PLATFORM_REGISTRY } from './platform.tokens.js';

/**
 * Composition root for the platform area: providers derived from the central
 * GameSource registration list, the shared registry, and the generic
 * scheduler (spec FR-001). Adding a platform never edits this module's
 * generic wiring — registration flows through
 * `src/gamesources/index.ts` alone. Repositories are provided from the
 * connection's own entity list, so a new catalog entity joins automatically.
 */
@Module({
  imports: [TypeOrmModule.forFeature(entities), BroadcastModule],
  providers: [
    ...platformProviders,
    platformRegistryProvider,
    PlatformScheduler,
  ],
  exports: [PLATFORM_REGISTRY, PlatformScheduler],
})
export class PlatformsModule {}
