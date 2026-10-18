import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { SlashCommand, SlashCommandsService } from 'necord';
import type { SlashCommandDiscovery, SlashCommandContext } from 'necord';
import { gameSourceNames } from '../../gamesources/index.js';
import type { PlatformOptionDto } from '../subscription/dto/platform-option.dto.js';
import { AdminCommands } from './admin.commands.js';
import { TestGuildGuard } from './test-guild.guard.js';

/**
 * The `/sync` and `/broadcast` contract: registration payload (contracts §4
 * and G4) plus the invocation refusal US1 acceptance scenario 7 obliges.
 *
 * These two handlers existed before spec 006 without a spec of their own, so
 * this file is deliberately small — it pins only what the feature changed
 * (they are now scoped to `TEST_GUILD_ID` *and* refuse at runtime) plus the
 * declaration shape `CommandScopeService` narrows.
 */

const TEST_GUILD = '111111111111111111';
const OTHER_GUILD = '999999999999999999';

function guardFor(testGuildId: string | undefined): TestGuildGuard {
  return new TestGuildGuard({
    get: (key: string) => (key === 'TEST_GUILD_ID' ? testGuildId : undefined),
  } as unknown as ConfigService);
}

const reflector = new Reflector();
const prototype = AdminCommands.prototype as unknown as Record<string, unknown>;

function methodNames(): string[] {
  return Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== 'constructor',
  );
}

interface Explored {
  discovery: SlashCommandDiscovery;
  handler: (...args: unknown[]) => void;
}

/** `explore(key)` — the shape `SlashCommandsModule` calls it with. */
function explore(key: string): Explored[] {
  return methodNames()
    .map((name) => prototype[name])
    .filter((handler): handler is (...args: unknown[]) => void =>
      Boolean(handler),
    )
    .map((handler) => ({
      discovery: reflector.get(key, handler) as
        SlashCommandDiscovery | undefined,
      handler,
    }))
    .filter((item): item is Explored => Boolean(item.discovery));
}

/** Replays `SlashCommandsModule.onModuleInit` against a fresh registry. */
function register(): SlashCommandsService {
  const service = new SlashCommandsService(reflector);

  for (const { discovery, handler } of explore(SlashCommand.KEY)) {
    discovery.setDiscoveryMeta({ class: AdminCommands, handler });
    service.add(discovery);
  }

  return service;
}

/** One root, or an explicit failure — a missing root is the bug under test. */
function root(
  service: SlashCommandsService,
  name: string,
): SlashCommandDiscovery {
  const discovery = service.get(name);
  if (!discovery) {
    throw new Error(`\`${name}\` root was not registered`);
  }
  return discovery;
}

interface Raw {
  name: string;
  options?: Raw[];
  choices?: Array<{ name: string; value: string }>;
}

interface CommandPayload {
  name: string;
  description: string;
  dmPermission?: boolean;
  defaultMemberPermissions?: bigint | null;
  options?: Raw[];
}

describe('AdminCommands registration', () => {
  it('registers `sync` and `broadcast` as ordinary roots', () => {
    const service = register();

    expect(service.get('sync')).toBeDefined();
    expect(service.get('broadcast')).toBeDefined();
  });

  it('builds the payload Discord receives: admin-only, no DMs (G4)', () => {
    for (const name of ['sync', 'broadcast'] as const) {
      const payload = root(
        register(),
        name,
      ).toJSON() as unknown as CommandPayload;

      expect(payload.name).toBe(name);
      expect(payload.description).toBeTruthy();
      expect(payload.dmPermission).toBe(false);
      expect(payload.defaultMemberPermissions).toBe(
        PermissionFlagsBits.Administrator,
      );
    }
  });

  it('offers exactly the registered platforms, so no other value can arrive (FR-011)', () => {
    const payload = root(
      register(),
      'sync',
    ).toJSON() as unknown as CommandPayload;
    const platform = payload.options?.find(
      (option) => option.name === 'platform',
    );

    expect(platform?.choices?.map((choice) => choice.value)).toEqual(
      Object.keys(gameSourceNames),
    );
  });

  /** The hook narrows them; Necord must hand over global roots to do that. */
  it('starts global so `CommandScopeService` is the thing that narrows them', () => {
    const service = register();

    for (const name of ['sync', 'broadcast'] as const) {
      const discovery = root(service, name);
      expect(discovery.isGlobal()).toBe(true);

      discovery.setGuilds([TEST_GUILD]);
      expect(discovery.isGlobal()).toBe(false);
      expect(discovery.getGuilds()).toEqual([TEST_GUILD]);
    }
  });
});

/**
 * US1 acceptance scenario 7: the refusal is observable in the handler,
 * before anything is deferred and before any catalog is touched.
 */
describe('AdminCommands test-guild refusal (US1/AC7)', () => {
  interface FakeInteraction {
    guildId: string | null | undefined;
    deferReply: ReturnType<typeof vi.fn>;
    editReply: ReturnType<typeof vi.fn>;
    reply: ReturnType<typeof vi.fn>;
  }

  function fakeInteraction(
    guildId: string | null | undefined = TEST_GUILD,
  ): FakeInteraction {
    return {
      guildId,
      deferReply: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      editReply: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      reply: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    };
  }

  /**
   * Carries every `PlatformRuntime` member so the object is structurally
   * assignable without a cast; only `sync` / `broadcastPending` are asserted
   * on, and — as in `dev.commands.spec.ts` — inferring it as a plain object
   * keeps those assertions from tripping `unbound-method`.
   */
  function runtimeFixture() {
    return {
      type: 'epic',
      sync: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      broadcastPending: vi.fn<() => Promise<number>>(() => Promise.resolve(2)),
      reset: vi
        .fn<() => Promise<{ fetched: number; seeded: number }>>()
        .mockResolvedValue({ fetched: 0, seeded: 0 }),
      devBroadcast: vi
        .fn<
          () => Promise<{
            delivered: number;
            suppressed: number;
            skipped: boolean;
          }>
        >()
        .mockResolvedValue({ delivered: 0, suppressed: 0, skipped: true }),
    };
  }

  function callSync(
    guard: TestGuildGuard,
    runtime: ReturnType<typeof runtimeFixture>,
    interaction: FakeInteraction,
  ) {
    return new AdminCommands(guard, [runtime]).onSync(
      [interaction] as unknown as SlashCommandContext,
      { platform: 'epic' } as unknown as PlatformOptionDto,
    );
  }

  function callBroadcast(
    guard: TestGuildGuard,
    runtime: ReturnType<typeof runtimeFixture>,
    interaction: FakeInteraction,
  ) {
    return new AdminCommands(guard, [runtime]).onBroadcast(
      [interaction] as unknown as SlashCommandContext,
      { platform: 'epic' } as unknown as PlatformOptionDto,
    );
  }

  it('refuses an out-of-guild `/sync` without running it', async () => {
    const interaction = fakeInteraction(OTHER_GUILD);
    const runtime = runtimeFixture();

    await callSync(guardFor(TEST_GUILD), runtime, interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(runtime.sync).not.toHaveBeenCalled();
  });

  it('refuses an out-of-guild `/broadcast` without running it', async () => {
    const interaction = fakeInteraction(OTHER_GUILD);
    const runtime = runtimeFixture();

    await callBroadcast(guardFor(TEST_GUILD), runtime, interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(interaction.deferReply).not.toHaveBeenCalled();
    expect(runtime.broadcastPending).not.toHaveBeenCalled();
  });

  it('refuses a DM, where there is no guild id to match', async () => {
    const interaction = fakeInteraction(null);
    const runtime = runtimeFixture();

    await callSync(guardFor(TEST_GUILD), runtime, interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(runtime.sync).not.toHaveBeenCalled();
  });

  it('refuses when no test guild is configured, even in a guild', async () => {
    const interaction = fakeInteraction(TEST_GUILD);
    const runtime = runtimeFixture();

    await callBroadcast(guardFor(undefined), runtime, interaction);

    expect(interaction.reply).toHaveBeenCalledTimes(1);
    expect(runtime.broadcastPending).not.toHaveBeenCalled();
  });

  it('permits the same invocation once it is in the test guild', async () => {
    const interaction = fakeInteraction(TEST_GUILD);
    const runtime = runtimeFixture();

    await callSync(guardFor(TEST_GUILD), runtime, interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(runtime.sync).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
  });
});
