import { Logger } from '@nestjs/common';
import chalk from 'chalk';
import { GamePlatformName } from '../../shared/constants.js';
import type { GamePlatformType } from '../../shared/constants.js';
import type { Game } from '../../shared/types/index.js';
import type { BroadcastService } from '../broadcast/broadcast.service.js';
import type {
  PlatformApi,
  PlatformDefinition,
  PlatformMapper,
  PlatformRepository,
  PlatformRuntime,
} from './platform.types.js';

/**
 * The one generic platform lifecycle (research R1, plan §13): fetch → map →
 * persist, and find pending → send → mark. Storefront-specific behavior is
 * injected through the definition's components — this class contains no
 * platform branching (spec FR-005).
 *
 * Directly constructible in specs: constructor takes plain objects, no
 * Nest testing module (Constitution V).
 */
export class GenericPlatform<
  TSource,
  TGame extends Game,
> implements PlatformRuntime {
  private readonly logger = new Logger(GenericPlatform.name);

  constructor(
    private readonly definition: PlatformDefinition<TSource, TGame>,
    private readonly api: PlatformApi<TSource>,
    private readonly mapper: PlatformMapper<TSource, TGame>,
    private readonly repository: PlatformRepository<TGame>,
    private readonly broadcast: Pick<BroadcastService, 'send'>,
  ) {}

  get type(): GamePlatformType {
    return this.definition.type;
  }

  async sync(): Promise<void> {
    const sources = await this.api.fetch();

    const games: TGame[] = [];
    for (const source of sources) {
      const game = this.mapper.toGame(source);
      if (game !== null) {
        games.push(game);
      }
    }

    const name = GamePlatformName[this.definition.type];
    this.logger.log(
      `Fetched ${games.length} games from ${chalk.bold.green(name)}`,
    );

    if (games.length > 0) {
      await this.repository.saveAll(games);
      this.logger.log(`Upserted ${games.length} games into ${name} catalog`);
    }
  }

  async broadcastPending(): Promise<number> {
    const name = GamePlatformName[this.definition.type];
    const games = await this.repository.findPending(new Date());

    if (games.length === 0) {
      this.logger.log(
        `No new games to broadcast for ${chalk.bold.green(name)}`,
      );
      return 0;
    }

    this.logger.log(
      `Broadcasting ${games.length} new games for ${chalk.bold.green(name)}`,
    );

    let announced = 0;
    for (const game of games) {
      try {
        // Constitution II: delivery first, durable state second. A game is
        // only recorded as announced after send() resolved successfully.
        await this.broadcast.send(
          this.definition.message,
          game,
          this.definition.type,
        );
        await this.repository.markBroadcasted(game);
        announced++;
      } catch (error) {
        this.logger.error(
          `Error broadcasting ${name} game ${game.title}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return announced;
  }
}
