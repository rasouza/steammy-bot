import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SlashCommandsService } from 'necord';

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
 */
@Injectable()
export class CommandScopeService implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly slashCommands: SlashCommandsService,
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
  }
}
