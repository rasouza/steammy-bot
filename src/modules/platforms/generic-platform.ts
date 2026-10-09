import { Logger } from '@nestjs/common';
import chalk from 'chalk';
import type { Game } from './platform.types.js';
import type {
  BroadcastPort,
  DevBroadcastOutcome,
  PlatformApi,
  PlatformDefinition,
  PlatformMapper,
  PlatformRepository,
  PlatformRuntime,
  ResetOutcome,
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
    const name = this.definition.name;
    const { games } = await this.load();

    this.logger.log(
      `Fetched ${games.length} games from ${chalk.bold.green(name)}`,
    );

    if (games.length > 0) {
      await this.repository.saveAll(games);
      this.logger.log(`Upserted ${games.length} games into ${name} catalog`);
    }
  }

  /**
   * `/dev sync` — research R5's ordering, contracts §4 / R-4.4.
   *
   * `fetch → map → clear → saveAll → markAllBroadcasted`. The catalog is
   * replaced, not merged: `clear()` runs even when the fetch returned zero
   * rows, because a successful empty response means the catalog really is
   * empty. Only a *failed* fetch preserves the old rows, and that is decided
   * entirely by `load()` rejecting before any write exists to undo.
   */
  async reset(): Promise<ResetOutcome> {
    const name = this.definition.name;

    // R-4.4: nothing below runs unless this resolves, so a storefront outage
    // leaves the catalog byte-identical rather than empty (US3 scenario 3).
    const { fetched, games } = await this.load();

    await this.repository.clear();

    if (games.length > 0) {
      await this.repository.saveAll(games);
    }

    // Whole-catalog mark: these rows were never delivered, which is the
    // carve-out Principle II conditions on — hence the count, for FR-015.
    const seeded = await this.repository.markAllBroadcasted();

    this.logger.log(
      `Dev reset of ${chalk.bold.green(name)}: ${fetched} fetched, ${seeded} seeded announced`,
    );

    return { fetched, seeded };
  }

  /**
   * fetch → map, shared by `sync()` and `reset()` so the two cannot diverge.
   *
   * It writes nothing: mapping happens entirely in memory, and a rejected
   * `fetch` rejects here — which is the whole of R-4.4's guarantee.
   * `fetched` is the raw storefront response; `games` is what survived
   * mapping, which is what both callers actually store.
   */
  private async load(): Promise<{ fetched: number; games: TGame[] }> {
    const sources = await this.api.fetch();

    const games: TGame[] = [];
    for (const source of sources) {
      const game = this.mapper.toGame(source);
      if (game !== null) {
        games.push(game);
      }
    }

    return { fetched: sources.length, games };
  }

  async broadcastPending(): Promise<number> {
    return this.deliverPending();
  }

  /**
   * `/dev broadcast` for this platform — research R6's four steps.
   *
   * The surplus is suppressed *before* the one delivery so the pass has
   * exactly one eligible row, and the suppression count it returns is the
   * number FR-015 obliges the reply to state. Nothing here introduces a
   * second sender: step 4 is the same loop `broadcastPending` runs, only
   * addressed at `recipient`.
   */
  async devBroadcast(recipient: string): Promise<DevBroadcastOutcome> {
    const name = this.definition.name;
    const now = new Date();

    // Step 1 — deterministic pick (ascending id, FR-006). Nothing eligible
    // means the platform contributes nothing to the reply but its absence.
    const candidate = await this.repository.findDevCandidate(now);

    if (candidate === null) {
      this.logger.log(
        `Dev broadcast: ${chalk.bold.green(name)} has no eligible row; skipping`,
      );
      return { delivered: 0, suppressed: 0, skipped: true };
    }

    // Step 2 — the surplus. Those rows are marked announced without being
    // delivered, which is the carve-out Principle II conditions on.
    const suppressed = await this.repository.markBroadcastedExcept(
      candidate,
      now,
    );

    // Step 3 — unconditional so the sequence has one shape: a no-op when the
    // candidate was already pending, and the flip that makes a fully
    // announced catalog deliverable again when it was not. Step 4 reads
    // `findPending`, so without this a catalog that has nothing pending
    // would deliver nothing and report zero forever (SC-002).
    await this.repository.markPending(candidate);

    // Step 4 — the normal loop, which now sees exactly one pending row.
    const delivered = await this.deliverPending(recipient);

    return { delivered, suppressed, skipped: false };
  }

  /**
   * findPending → send → mark, shared by the scheduled pass and `/dev broadcast`.
   *
   * `recipient` is the invocation channel when this is a dev smoke pass;
   * absent, the subscriptions are the audience exactly as before (R-4.2).
   */
  private async deliverPending(recipient?: string): Promise<number> {
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

    // R-4.2: only `devBroadcast` supplies a recipient. The scheduled pass
    // does not merely pass `undefined` — it makes the same three-argument
    // call it always has, so the scheduled path is untouched by this change.
    const send =
      recipient === undefined
        ? (game: TGame) =>
            this.broadcast.send(
              this.definition.message,
              game,
              this.definition.type,
            )
        : (game: TGame) =>
            this.broadcast.send(
              this.definition.message,
              game,
              this.definition.type,
              recipient,
            );

    let announced = 0;
    for (const game of games) {
      try {
        // Constitution II / spec FR-010: delivery first, durable state second.
        // Mark only when at least one channel received the game, or when
        // nobody subscribes at all (A-005) so the queue stays bounded —
        // otherwise leave it pending for the next pass.
        const { delivered, subscribers } = await send(game);

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
