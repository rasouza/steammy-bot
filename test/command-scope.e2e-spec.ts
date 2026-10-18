import { EventEmitter } from 'node:events';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from 'discord.js';
import {
  CommandsService,
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
 *
 * The same shape, one step later: the ready-time half of FR-003 fails **open**
 * in the other direction. If the bot is not in the configured test guild,
 * `application.commands.set` rejects for it and Necord rethrows that straight
 * out of a `clientReady` listener whose promise lands in an EventEmitter — so
 * a missing prune does not read as "not offered", it reads as a dead process.
 */

/** Mutable stand-in for `ConfigService`; each test sets it before booting. */
const scopeEnv: Record<string, string | undefined> = {};

/**
 * One client for the whole file, with a guild cache each test seeds or
 * empties. A real `EventEmitter` so `prependOnceListener` ordering — the
 * property that keeps Necord's registration from throwing — is genuinely
 * observable rather than mocked away.
 */
const guildCache = new Map<string, unknown>();
const fakeClient = Object.assign(new EventEmitter(), {
  guilds: { cache: guildCache },
});

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
    { provide: Client, useValue: fakeClient },
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
    {
      /**
       * Only the query `CommandScopeService` uses at ready time. It reaches
       * into `cache` exactly as Necord's own `CommandsService` does; nothing
       * registers here, so the assertions are about registry state alone.
       */
      provide: CommandsService,
      useFactory: (slashCommands: SlashCommandsService) => ({
        getGuildCommands: (guildId: string) =>
          [...slashCommands.cache.values()].filter((command) =>
            command.getGuilds()?.includes(guildId),
          ),
      }),
      inject: [SlashCommandsService],
    },
    CommandScopeService,
  ],
})
class TestScopeModule {}

async function boot(
  env: Record<string, string | undefined>,
  { joined = true, ready = true }: { joined?: boolean; ready?: boolean } = {},
): Promise<{
  app: TestingModule;
  slashCommands: SlashCommandsService;
}> {
  Object.keys(scopeEnv).forEach((key) => delete scopeEnv[key]);
  Object.assign(scopeEnv, env);
  guildCache.clear();
  if (joined && env.TEST_GUILD_ID) guildCache.set(env.TEST_GUILD_ID, {});

  const moduleRef = await Test.createTestingModule({
    imports: [TestNecordModule, TestScopeModule],
  }).compile();

  await moduleRef.init();

  // The real gateway emits this once every guild has been applied, which is
  // what makes the membership check sound (and its ordering observable).
  if (ready) fakeClient.emit('clientReady');

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

/**
 * FR-003's edge case: **the test guild is configured but the bot is not a
 * member of it**. Startup must succeed and the commands must simply not be
 * offered — which for this graph means the registry has nothing guild-pinned
 * left by the time registration would run.
 *
 * The `fails **open**` reading of a regression here is not "still offered",
 * it is "process exits": `registerCommandsInGuild` rejects for a guild the
 * bot cannot see, and Necord rethrows that out of a bare `clientReady`
 * listener.
 */
describe('CommandScopeService (unreachable test guild)', () => {
  const guild = '111111111111111111';
  let app: TestingModule | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  /** AC5 in a deployed run: what the operator would otherwise see as a crash. */
  it('offers no scoped command when the guild is configured but unreachable', async () => {
    const booted = await boot(
      { TEST_GUILD_ID: guild, NODE_ENV: 'production' },
      { joined: false },
    );
    app = booted.app;

    for (const root of SCOPED_ROOTS) {
      expect(booted.slashCommands.get(root)).toBeUndefined();
    }

    // …while the commands this service does not own are untouched (G2).
    for (const root of ['ping', 'invite', 'help']) {
      expect(booted.slashCommands.get(root)?.isGlobal()).toBe(true);
      expect(booted.slashCommands.get(root)?.getGuilds()).toBeUndefined();
    }
  });

  /** Same edge case in a local development run, where `dev` is also offered. */
  it('drops the dev root too when a development run cannot reach the guild', async () => {
    const booted = await boot(
      { TEST_GUILD_ID: guild, NODE_ENV: 'development' },
      { joined: false },
    );
    app = booted.app;

    for (const root of SCOPED_ROOTS) {
      expect(booted.slashCommands.get(root)).toBeUndefined();
    }
    for (const root of ['ping', 'invite', 'help']) {
      expect(booted.slashCommands.get(root)?.isGlobal()).toBe(true);
    }
  });

  /**
   * The ordering property, asserted against the real registry: a listener
   * registered *after* ours stands in for the one Necord registers to do the
   * actual `application.commands.set`. It must find nothing guild-pinned to
   * send — if it ever finds `sync`, that call rejects and the rejection has
   * nowhere to go.
   */
  it('prunes before the listener that performs the registration', async () => {
    const booted = await boot(
      { TEST_GUILD_ID: guild, NODE_ENV: 'production' },
      { joined: false, ready: false },
    );
    app = booted.app;

    let scopedSeenLater: string[] | undefined;
    fakeClient.once('clientReady', () => {
      scopedSeenLater = SCOPED_ROOTS.filter((root) =>
        booted.slashCommands.get(root),
      );
    });

    fakeClient.emit('clientReady');

    expect(scopedSeenLater).toEqual([]);
    // Nothing was made global as a side effect (G1).
    for (const root of SCOPED_ROOTS) {
      expect(booted.slashCommands.get(root)).toBeUndefined();
    }
  });

  /** Reachable guild: the ready-time check must not disturb anything. */
  it('leaves a reachable guild exactly as the registration decision left it', async () => {
    const booted = await boot(
      { TEST_GUILD_ID: guild, NODE_ENV: 'development' },
      { joined: true },
    );
    app = booted.app;

    for (const root of SCOPED_ROOTS) {
      const command = booted.slashCommands.get(root);
      expect(command?.getGuilds()).toEqual([guild]);
    }
    for (const root of ['ping', 'invite', 'help']) {
      expect(booted.slashCommands.get(root)?.isGlobal()).toBe(true);
    }
  });
});
