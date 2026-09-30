import { Logger } from '@nestjs/common';
import chalk from 'chalk';
import type { Game } from './platform.types.js';
import type {
  BroadcastPort,
  PlatformApi,
  PlatformDefinition,
  PlatformMapper,
  PlatformRepository,
  PlatformRuntime,
} from './platform.types.js';

/**
 * The one generic platform lifecycle (research R1, plan §13): fetch → map →
 * persist, and find pending → send → mark. GameSource-specific behavior is
 * injected through the definition's components — this class contains no
 * platform branching (spec FR-005). Display names come from the definition,
 * so the machinery never imports the name record (FR-001).
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
    private readonly broadcast: BroadcastPort<TGame>,
  ) {}

  get type(): string {
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

    const name = this.definition.name;
    this.logger.log(
      `Fetched ${games.length} games from ${chalk.bold.green(name)}`,
    );

    if (games.length > 0) {
      await this.repository.saveAll(games);
      this.logger.log(`Upserted ${games.length} games into ${name} catalog`);
    }
  }

  async broadcastPending(): Promise<number> {
    const name = this.definition.name;
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
        // Constitution II / spec FR-010: delivery first, durable state second.
        // Mark only when at least one channel received the game, or when
        // nobody subscribes at all (A-005) so the queue stays bounded —
        // otherwise leave it pending for the next pass.
        const { delivered, subscribers } = await this.broadcast.send(
          this.definition.message,
          game,
          this.definition.type,
        );

        if (delivered > 0 || subscribers === 0) {
          await this.repository.markBroadcasted(game);
          announced++;
        } else {
          this.logger.warn(
            `Delivery failed for ${name} game ${game.title} (${delivered}/${subscribers} channels received it); leaving it pending for the next pass`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Error broadcasting ${name} game ${game.title}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return announced;
  }
}
