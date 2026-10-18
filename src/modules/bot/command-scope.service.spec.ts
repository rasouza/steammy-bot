import { EventEmitter } from 'node:events';
import { ConfigService } from '@nestjs/config';
import type { Client } from 'discord.js';
import type { CommandsService, SlashCommandsService } from 'necord';
import {
  CommandScopeService,
  selectCommandScope,
} from './command-scope.service.js';

/**
 * The registration decision, split from the effect (research R10): this is a
 * pure function of two strings, unit-tested directly with no Nest testing
 * module and no Discord token (Principle V). The *effect* — that the real
 * hook lands on an already-populated registry — is asserted in
 * `test/command-scope.e2e-spec.ts`, because a regression there fails **open**.
 *
 * Covers contracts §1 (G1–G3) and §2 for the 3 roots × 3 env states.
 */
describe('selectCommandScope', () => {
  const guild = '111111111111111111';
  const roots = ['sync', 'broadcast', 'dev'] as const;

  /** G1/G2: with no test guild the three roots are removed, never global. */
  it('removes every root when no test guild is configured', () => {
    for (const root of roots) {
      expect(selectCommandScope(root, undefined, 'development')).toEqual({
        kind: 'removed',
      });
      expect(selectCommandScope(root, '', 'production')).toEqual({
        kind: 'removed',
      });
    }
  });

  /** Development run: all four commands are reachable in the test guild. */
  it('pins every root to the test guild in a development run', () => {
    for (const root of roots) {
      expect(selectCommandScope(root, guild, 'development')).toEqual({
        kind: 'guild',
        guilds: [guild],
      });
    }
  });

  /** G1: the admin pair is guild-scoped in every run mode (FR-013). */
  it('pins sync and broadcast to the test guild in a deployed run', () => {
    for (const root of ['sync', 'broadcast'] as const) {
      expect(selectCommandScope(root, guild, 'production')).toEqual({
        kind: 'guild',
        guilds: [guild],
      });
    }
  });

  /** G3: the dev pair never ships, even with the guild configured. */
  it('removes dev from a deployed run even when the guild is configured', () => {
    expect(selectCommandScope('dev', guild, 'production')).toEqual({
      kind: 'removed',
    });
    expect(selectCommandScope('dev', guild, 'staging')).toEqual({
      kind: 'removed',
    });
  });

  /** An absent `NODE_ENV` must never widen anything (contracts §2). */
  it('never treats an undefined NODE_ENV as development', () => {
    for (const root of roots) {
      const scope = selectCommandScope(root, guild, undefined);
      expect(scope).toEqual(
        root === 'dev'
          ? { kind: 'removed' }
          : { kind: 'guild', guilds: [guild] },
      );
    }
  });

  /** G1: a scoped command is never global — guilds is exactly one entry. */
  it('scopes to exactly one guild, never to a global registration', () => {
    for (const root of roots) {
      expect(selectCommandScope(root, guild, 'development')).toEqual({
        kind: 'guild',
        guilds: [guild],
      });
    }
  });
});

/**
 * The second moment this service owns: FR-003's edge case, "the test guild is
 * configured but the bot is not a member of it".
 *
 * Registration alone cannot cover it — a guild the bot cannot see makes
 * `application.commands.set` reject, and Necord rethrows that from a bare
 * `clientReady` listener whose promise goes straight into an EventEmitter.
 * So the decision is re-checked at `clientReady`, and the listener is
 * *prepended*, because Necord's registration listener must see the pruned
 * registry rather than do the pruning and throw.
 *
 * Direct construction with fakes throughout (Principle V): a real
 * `EventEmitter` stands in for the client so listener order is genuinely
 * observable, and `getGuildCommands` filters a live map the way the real one
 * filters a real registry.
 */
describe('CommandScopeService — unreachable test guild (FR-003)', () => {
  const GUILD = '111111111111111111';

  interface FakeDiscovery {
    setGuilds: ReturnType<typeof vi.fn>;
    getName(): string;
    getGuilds(): string[] | undefined;
  }

  /** A registry entry: `guilds` is `undefined` until something pins it. */
  function fakeDiscovery(name: string, guilds?: string[]): FakeDiscovery {
    const state = { guilds };

    return {
      setGuilds: vi.fn<(value: string | string[]) => void>((value) => {
        state.guilds = Array.isArray(value) ? value : [value];
      }),
      getName: () => name,
      getGuilds: () => state.guilds,
    };
  }

  interface FakeClient extends EventEmitter {
    guilds: { cache: Map<string, unknown> };
  }

  function fakeClient(joined: boolean): FakeClient {
    const client = new EventEmitter() as FakeClient;
    client.guilds = { cache: new Map<string, unknown>() };
    if (joined) client.guilds.cache.set(GUILD, {});
    return client;
  }

  function harness(
    env: Record<string, string | undefined>,
    client: FakeClient,
    entries: FakeDiscovery[],
  ) {
    const registry = new Map(entries.map((entry) => [entry.getName(), entry]));
    const remove = vi.fn<(name: string) => boolean>((name) =>
      registry.delete(name),
    );
    const get = vi.fn<(name: string) => FakeDiscovery | undefined>((name) =>
      registry.get(name),
    );
    const slashCommands = { remove, get } as unknown as SlashCommandsService;
    const getGuildCommands = vi.fn<(guildId: string) => FakeDiscovery[]>(
      (guildId) =>
        [...registry.values()].filter((entry) =>
          entry.getGuilds()?.includes(guildId),
        ),
    );
    const commands = { getGuildCommands } as unknown as CommandsService;
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;

    return {
      scope: new CommandScopeService(
        config,
        slashCommands,
        client as unknown as Client,
        commands,
      ),
      registry,
      remove,
      getGuildCommands,
    };
  }

  it('re-checks nothing when the guild is reachable', () => {
    const client = fakeClient(true);
    const sync = fakeDiscovery('sync');
    const ping = fakeDiscovery('ping', [GUILD]);
    const harnessResult = harness(
      { TEST_GUILD_ID: GUILD, NODE_ENV: 'production' },
      client,
      [sync, ping],
    );

    harnessResult.scope.onModuleInit();
    client.emit('clientReady');

    // The membership check short-circuits: the guild-scoped queries a broken
    // configuration needs never run, and nothing is unpinned.
    expect(harnessResult.getGuildCommands).not.toHaveBeenCalled();
    expect(ping.setGuilds).not.toHaveBeenCalled();
  });

  it('drops the scoped roots when the guild is unreachable', () => {
    const client = fakeClient(false);
    const sync = fakeDiscovery('sync');
    const broadcast = fakeDiscovery('broadcast');
    const harnessResult = harness(
      { TEST_GUILD_ID: GUILD, NODE_ENV: 'production' },
      client,
      [sync, broadcast],
    );

    harnessResult.scope.onModuleInit();
    const removalsBefore = harnessResult.remove.mock.calls.length;
    client.emit('clientReady');

    expect(harnessResult.registry.has('sync')).toBe(false);
    expect(harnessResult.registry.has('broadcast')).toBe(false);
    // `dev` was already removed by the registration decision; only the
    // ready-time check may add removals.
    expect(harnessResult.remove.mock.calls.length).toBe(removalsBefore + 2);
  });

  /**
   * G1: a scoped root is never made global as a side effect of a broken
   * configuration — it is simply not offered.
   */
  it('never falls back to offering a scoped root globally', () => {
    const client = fakeClient(false);
    const sync = fakeDiscovery('sync');
    const harnessResult = harness(
      { TEST_GUILD_ID: GUILD, NODE_ENV: 'development' },
      client,
      [sync],
    );

    harnessResult.scope.onModuleInit();
    client.emit('clientReady');

    expect(sync.setGuilds).not.toHaveBeenCalledWith([]);
    expect(sync.getGuilds()).toEqual([GUILD]);
  });

  /**
   * G2: the five always-global commands are guild-scoped only by Necord's
   * `development` option, so an unreachable guild unpins them back to global
   * instead of dropping them.
   */
  it('re-offers the always-global commands globally, not at all-scoped', () => {
    const client = fakeClient(false);
    const ping = fakeDiscovery('ping', [GUILD]);
    const harnessResult = harness(
      { TEST_GUILD_ID: GUILD, NODE_ENV: 'development' },
      client,
      [ping],
    );

    harnessResult.scope.onModuleInit();
    client.emit('clientReady');

    expect(ping.setGuilds).toHaveBeenCalledWith([]);
    expect(harnessResult.registry.has('ping')).toBe(true);
  });

  /**
   * The whole point of prepending: a listener registered *after* this one is
   * what Necord's registration is, and it must observe the pruned registry.
   * If the order ever flips, `application.commands.set` rejects for the
   * unreachable guild and Necord rethrows with nothing to catch it.
   */
  it('runs before the listener Necord registers to do the actual registration', () => {
    const client = fakeClient(false);
    const sync = fakeDiscovery('sync');
    const harnessResult = harness(
      { TEST_GUILD_ID: GUILD, NODE_ENV: 'production' },
      client,
      [sync],
    );

    harnessResult.scope.onModuleInit();

    let seenByNecord: string[] | undefined;
    client.once('clientReady', () => {
      seenByNecord = [...harnessResult.registry.keys()];
    });

    client.emit('clientReady');

    expect(seenByNecord).toEqual([]);
  });

  /** Without a configured guild there is nothing pinned, so nothing to re-check. */
  it('registers no ready-time check when no test guild is configured', () => {
    const client = fakeClient(false);
    const harnessResult = harness({}, client, []);

    harnessResult.scope.onModuleInit();

    expect(client.listenerCount('clientReady')).toBe(0);
    client.emit('clientReady');
    expect(harnessResult.getGuildCommands).not.toHaveBeenCalled();
  });
});
