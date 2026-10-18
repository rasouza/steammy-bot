import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'discord.js';
import { CommandsService, SlashCommandsService } from 'necord';

/**
 * Which of our root commands Discord is told about, decided once before login
 * (contracts §1/§2, research R1).
 *
 * `undefined` is never treated as `development`; the absence of `NODE_ENV`
 * must not widen anything (`envSchema` gives it no default on purpose).
 */
export type CommandScope =
  { kind: 'removed' } | { kind: 'guild'; guilds: [string] };

/** The three roots this service owns. The other five stay global. */
export const SCOPED_ROOTS = ['sync', 'broadcast', 'dev'] as const;

export type ScopedRoot = (typeof SCOPED_ROOTS)[number];

/**
 * Pure decision — unit-tested directly so the effect can be tested
 * separately against the real registry (research R10).
 *
 * - no test guild ⇒ removed for all three roots (FR-002, failing closed)
 * - `dev` additionally requires a local development run (FR-014)
 * - otherwise pinned to exactly the test guild (FR-001, FR-013)
 */
export function selectCommandScope(
  rootName: ScopedRoot,
  testGuildId: string | undefined,
  nodeEnv: string | undefined,
): CommandScope {
  if (!testGuildId) {
    return { kind: 'removed' };
  }

  if (rootName === 'dev' && nodeEnv !== 'development') {
    return { kind: 'removed' };
  }

  return { kind: 'guild', guilds: [testGuildId] };
}

/**
 * Applies `selectCommandScope` to Necord's command registry.
 *
 * `onModuleInit` is deliberately the hook: by then `ConfigModule.forRoot()`
 * has assigned `.env` and `SlashCommandsModule` has populated its cache,
 * while `client.login()` — and therefore registration — has not happened
 * yet (research R1). Ordering matters because pruning an unpopulated cache
 * would silently no-op and fail **open**, leaving the commands global.
 *
 * `NecordModule`'s own `development` option is left untouched; it still
 * governs the five always-global commands, and `CommandsModule` re-applies
 * it afterwards in `onApplicationBootstrap` with the same guild id, so the
 * two mechanisms agree rather than fight.
 *
 * Two moments, two jobs: `onModuleInit` decides *where* the commands are
 * offered, and the prepended `clientReady` listener re-checks that decision
 * once guild membership is actually knowable — the case registration alone
 * cannot cover, because a pinned guild the bot is not in makes
 * `application.commands.set` reject and Necord rethrow it with nothing to
 * catch it (FR-003).
 */
@Injectable()
export class CommandScopeService implements OnModuleInit {
  private readonly logger = new Logger(CommandScopeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly slashCommands: SlashCommandsService,
    private readonly client: Client,
    private readonly commands: CommandsService,
  ) {}

  onModuleInit(): void {
    const testGuildId = this.config.get<string>('TEST_GUILD_ID');
    const nodeEnv = this.config.get<string>('NODE_ENV');

    for (const rootName of SCOPED_ROOTS) {
      const scope = selectCommandScope(rootName, testGuildId, nodeEnv);

      if (scope.kind === 'removed') {
        this.slashCommands.remove(rootName);
        continue;
      }

      // Absent roots are simply not offered — never an error at startup
      // (FR-003: failing to offer a command must not prevent the bot booting).
      this.slashCommands.get(rootName)?.setGuilds(scope.guilds);
    }

    if (testGuildId) {
      // Membership is unknowable before login, so FR-003's real edge case —
      // the guild is configured but the bot is not in it — can only be
      // discovered at `clientReady`. Prepended so this runs *before* Necord's
      // own registration listener: `registerCommandsInGuild` rethrows a
      // rejected `application.commands.set` straight out of a bare listener
      // that returns its promise into an EventEmitter, so one unregistered
      // guild would otherwise take the process down. The body must stay
      // synchronous — Necord's listener starts the moment ours returns.
      this.client.prependOnceListener('clientReady', () =>
        this.dropUnreachableGuild(testGuildId),
      );
    }
  }

  /**
   * Removes everything pinned to a guild the bot cannot see, so registration
   * has nothing left to fail on (FR-003: startup succeeds and the commands
   * are simply not offered anywhere).
   *
   * Scoped roots are dropped outright rather than made global — a command we
   * only ever mean to run in the test guild must not escape to every other
   * server as a side effect of a broken configuration (contracts G1). The
   * five always-global commands are unpinned instead: they are guild-scoped
   * only by Necord's `development` option, and an empty guild list puts them
   * back where contracts G2 says they belong.
   */
  private dropUnreachableGuild(testGuildId: string): void {
    if (this.client.guilds.cache.has(testGuildId)) return;

    const pinned = this.commands.getGuildCommands(testGuildId);

    for (const command of pinned) {
      const name = command.getName();

      if (isScopedRoot(name)) {
        this.slashCommands.remove(name);
        continue;
      }

      command.setGuilds([]);
    }

    this.logger.warn(
      `Not offering ${
        pinned.map((command) => command.getName()).join(', ') || 'commands'
      }: test guild ${testGuildId} is not reachable`,
    );
  }
}

/** Type-guard for `SCOPED_ROOTS` membership without a widening cast at the use site. */
function isScopedRoot(name: string): name is ScopedRoot {
  return (SCOPED_ROOTS as readonly string[]).includes(name);
}
