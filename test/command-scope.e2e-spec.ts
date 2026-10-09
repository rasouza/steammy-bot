import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from 'discord.js';
import {
  NecordExplorerService,
  SlashCommand,
  SlashCommandDiscovery,
  SlashCommandsModule,
  SlashCommandsService,
} from 'necord';
import {
  CommandScopeService,
  SCOPED_ROOTS,
} from '../src/modules/bot/command-scope.service.js';

/**
 * The *effect* half of research R10: the real `SlashCommandsModule` populates
 * a real registry, then our hook runs against it under Nest's genuine
 * lifecycle ordering. No Discord token, no database.
 *
 * **Why this test exists**: if the hook ever ran before cache population it
 * would silently no-op and the commands would stay global — a failure that
 * fails **open**. Every assertion below catches that regression: a
 * not-yet-populated cache means `remove()` deletes nothing and `setGuilds()`
 * is never reached, so `sync`/`broadcast`/`dev` come back global (or present
 * at all), which is exactly what the assertions forbid (contracts G5).
 */

/** Mutable stand-in for `ConfigService`; each test sets it before booting. */
const scopeEnv: Record<string, string | undefined> = {};

function discovery(name: string): SlashCommandDiscovery {
  return new SlashCommandDiscovery({ name, description: `${name} probe` });
}

/** Roots `CommandScopeService` owns — it must reach these three. */
const scoped = () => SCOPED_ROOTS.map(discovery);

/** Roots it must never touch (contracts §1, row 4). */
const alwaysGlobal = () => ['ping', 'invite', 'help'].map(discovery);

@Global()
@Module({
  providers: [
    { provide: Client, useValue: { on: vi.fn() } },
    {
      // `design:paramtypes` on SlashCommandsModule injects the *class*, so
      // the token has to be the class too — a string token would never match.
      provide: NecordExplorerService,
      useValue: {
        explore: (metadataKey: string) =>
          // `SlashCommandsModule` explores two keys: roots, then subcommands.
          // There are no subcommands in this graph, and returning root
          // discoveries for that key would send `addSubCommand()` after
          // discoveries that have no class behind them.
          metadataKey === SlashCommand.KEY
            ? [...scoped(), ...alwaysGlobal()]
            : [],
      },
    },
  ],
  exports: [Client, NecordExplorerService],
})
class TestNecordModule {}

/**
 * Mirrors production: the module that hosts `CommandScopeService` imports the
 * Necord module that populates the cache, so the imported module sits deeper
 * in the graph and its `onModuleInit` runs first (research R1, ordering
 * fact 2).
 */
@Module({
  imports: [SlashCommandsModule],
  providers: [
    {
      provide: ConfigService,
      useValue: { get: (key: string) => scopeEnv[key] },
    },
    CommandScopeService,
  ],
})
class TestScopeModule {}

async function boot(env: Record<string, string | undefined>): Promise<{
  app: TestingModule;
  slashCommands: SlashCommandsService;
}> {
  Object.keys(scopeEnv).forEach((key) => delete scopeEnv[key]);
  Object.assign(scopeEnv, env);

  const moduleRef = await Test.createTestingModule({
    imports: [TestNecordModule, TestScopeModule],
  }).compile();

  await moduleRef.init();

  return {
    app: moduleRef,
    slashCommands: moduleRef.get(SlashCommandsService),
  };
}

describe('CommandScopeService (registration effect)', () => {
  const guild = '111111111111111111';
  let app: TestingModule | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  /** G1: never global, always exactly the test guild. */
  it('pins the admin and dev roots to the test guild in a development run', async () => {
    const booted = await boot({
      TEST_GUILD_ID: guild,
      NODE_ENV: 'development',
    });
    app = booted.app;

    for (const root of SCOPED_ROOTS) {
      const command = booted.slashCommands.get(root);
      expect(command).toBeDefined();
      expect(command?.isGlobal()).toBe(false);
      expect(command?.getGuilds()).toEqual([guild]);
    }
  });

  /** G1 (FR-013) + G3 (FR-014) in one deployed run. */
  it('keeps the admin pair in the test guild and drops the dev pair when deployed', async () => {
    const booted = await boot({
      TEST_GUILD_ID: guild,
      NODE_ENV: 'production',
    });
    app = booted.app;

    for (const root of ['sync', 'broadcast'] as const) {
      const command = booted.slashCommands.get(root);
      expect(command).toBeDefined();
      expect(command?.isGlobal()).toBe(false);
      expect(command?.getGuilds()).toEqual([guild]);
    }

    // A deployed run must not offer the catalog-clearing command at all.
    expect(booted.slashCommands.get('dev')).toBeUndefined();
  });

  /** G2 / FR-002: absent setting fails closed, and never breaks startup. */
  it('removes all three roots when no test guild is configured', async () => {
    const booted = await boot({ NODE_ENV: 'development' });
    app = booted.app;

    for (const root of SCOPED_ROOTS) {
      expect(booted.slashCommands.get(root)).toBeUndefined();
    }

    // …while the commands the service does not own are left alone.
    for (const root of ['ping', 'invite', 'help']) {
      expect(booted.slashCommands.get(root)?.isGlobal()).toBe(true);
    }
  });

  /** The hook is targeted: it scopes three roots and disturbs nothing else. */
  it('leaves the five always-global commands registered globally', async () => {
    const booted = await boot({
      TEST_GUILD_ID: guild,
      NODE_ENV: 'development',
    });
    app = booted.app;

    for (const root of ['ping', 'invite', 'help']) {
      const command = booted.slashCommands.get(root);
      expect(command).toBeDefined();
      expect(command?.isGlobal()).toBe(true);
      expect(command?.getGuilds()).toBeUndefined();
    }
  });
});
