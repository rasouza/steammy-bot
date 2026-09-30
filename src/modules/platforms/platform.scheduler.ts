import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PLATFORM_REGISTRY } from './platform.tokens.js';
import type { PlatformRuntime } from './platform.types.js';

/**
 * Drives every registered storefront through the generic lifecycle
 * (spec FR-004, clarification Q1). Timings are preserved from the old
 * per-platform crons (A-003): sync at the top of the hour, announce at
 * minute 10. One storefront failing never stops the others (research R1);
 * this class has zero platform imports or branches (FR-005).
 */
@Injectable()
export class PlatformScheduler {
  private readonly logger = new Logger(PlatformScheduler.name);

  constructor(
    @Inject(PLATFORM_REGISTRY) private readonly registry: PlatformRuntime[],
    private readonly config: ConfigService,
  ) {}

  @Cron('0 * * * *')
  async syncAll(): Promise<void> {
    for (const platform of this.registry) {
      try {
        await platform.sync();
      } catch (error) {
        this.logger.error(
          `Failed to sync ${platform.type}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }

  @Cron('10 * * * *')
  async broadcastAll(): Promise<number> {
    // Kill switch (spec FR-013, research R4): unset or 'true' announces;
    // only an explicit false skips the pass — a missing variable must
    // never mute production. The sync pass deliberately ignores this flag.
    const enabled = this.config.get<boolean | string>(
      'BROADCAST_ENABLED',
      true,
    );
    if (enabled === false || enabled === 'false') {
      this.logger.log(
        'Announcement pass disabled (BROADCAST_ENABLED); skipping.',
      );
      return 0;
    }

    let total = 0;

    for (const platform of this.registry) {
      try {
        total += await platform.broadcastPending();
      } catch (error) {
        this.logger.error(
          `Failed to broadcast ${platform.type}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return total;
  }
}
