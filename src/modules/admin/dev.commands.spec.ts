import { Reflector } from '@nestjs/core';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { SlashCommand, SlashCommandsService, Subcommand } from 'necord';
import type { SlashCommandDiscovery, SlashCommandContext } from 'necord';
import { gameSources } from '../../gamesources/index.js';
import type { PlatformOptionDto } from '../subscription/dto/platform-option.dto.js';
import { DevCommands } from './dev.commands.js';

/**
 * The `/dev` registration contract (contracts §1, FR-004, FR-005).
 *
 * This mirrors `NecordExplorerService.filterProperties` followed by
 * `SlashCommandsModule.onModuleInit` — the two pieces of Necord that decide
 * what Discord gets told about — so it exercises the *real* decorators and the
 * *real* `SlashCommandsService` with no Discord token (Principle V).
 *
 * It exists because the declaration shape is load-bearing: Necord resolves a
 * subcommand's root with `reflector.get(SlashCommand.KEY, subcommand.getClass())`,
 * a lookup on the class. Putting `@SlashCommand` on a method instead leaves
 * that lookup empty and `addSubCommand()` throws at boot — the bot would not
 * start. Nothing else in the suite would catch that, since a scope service
 * that cannot find the `dev` root would simply no-op and fail open.
 */

type Raw = Record<string, unknown>;

interface CommandPayload {
  name: string;
  description: string;
  dmPermission?: boolean;
  defaultMemberPermissions?: unknown;
  options: Array<{
    name: string;
    description: string;
    options?: Array<{ name: string; choices?: Array<{ value: string }> }>;
  }>;
}

const prototype = DevCommands.prototype as unknown as Record<string, unknown>;
const reflector = new Reflector();

function methodNames(): string[] {
  return Object.getOwnPropertyNames(prototype).filter(
    (name) => name !== 'constructor',
  );
}

interface Explored {
  discovery: SlashCommandDiscovery;
  handler: (...args: unknown[]) => void;
}

/** `explore(key)` — one key at a time, exactly as `SlashCommandsModule` calls it. */
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

  const roots = explore(SlashCommand.KEY);
  const subs = explore(Subcommand.KEY);

  for (const { discovery, handler } of roots) {
    // The real explorer passes `instance.constructor` as `class`; that value
    // is what `addSubCommand` reflects the root out of, so it must be the
    // class — and `handler` is what a subcommand reads its `@Options()` from.
    discovery.setDiscoveryMeta({ class: DevCommands, handler });
    service.add(discovery);
  }
  for (const { discovery, handler } of subs) {
    discovery.setDiscoveryMeta({ class: DevCommands, handler });
    service.addSubCommand(discovery);
  }

  return service;
}

/** The `dev` root, or an explicit failure — a missing root is the bug under test. */
function devRoot(service: SlashCommandsService): SlashCommandDiscovery {
  const root = service.get('dev');
  if (!root) {
    throw new Error('`dev` root was not registered');
  }
  return root;
}

describe('DevCommands registration', () => {
  it('registers without Necord rejecting the root/subcommand relationship', () => {
    expect(() => register()).not.toThrow();
  });

  it('exposes one `dev` root carrying exactly the two subcommands (G4)', () => {
    const root = devRoot(register());

    expect([...root.getSubcommands().keys()].sort()).toEqual([
      'broadcast',
      'sync',
    ]);
    // One root, not two: there is no `sync` / `broadcast` root of its own.
    expect(register().get('sync')).toBeUndefined();
    expect(register().get('broadcast')).toBeUndefined();
  });

  it('builds the payload Discord receives: admin-only, no DMs (FR-004)', () => {
    const payload = devRoot(register()).toJSON() as unknown as CommandPayload;

    expect(payload.name).toBe('dev');
    expect(payload.description).toBeTruthy();
    expect(payload.dmPermission).toBe(false);
    expect(payload.defaultMemberPermissions).toBe(
      PermissionFlagsBits.Administrator,
    );
  });

  it('gives `sync` the shared platform option and `broadcast` none (FR-005)', () => {
    const payload = devRoot(register()).toJSON() as unknown as CommandPayload;
    const byName = Object.fromEntries(
      payload.options.map((option) => [option.name, option]),
    );

    expect(Object.keys(byName).sort()).toEqual(['broadcast', 'sync']);
    expect(
      (byName.sync.options ?? []).map((option: Raw) => option.name),
    ).toEqual(['platform']);
    expect(byName.broadcast.options ?? []).toEqual([]);
  });

  /** The hook scoping it is a root Necord will let us reach (contracts §1). */
  it('starts global so `CommandScopeService` is the thing that narrows it', () => {
    const service = register();
    const root = devRoot(service);

    expect(root.isGlobal()).toBe(true);

    root.setGuilds(['111111111111111111']);
    expect(root.isGlobal()).toBe(false);
    expect(root.getGuilds()).toEqual(['111111111111111111']);

    expect(service.remove('dev')).toBe(true);
    expect(service.get('dev')).toBeUndefined();
  });
});

/**
 * The `/dev broadcast` reply contract (contracts §5, R-5.1–R-5.3, FR-015–FR-017).
 *
 * The obligations that matter here are *ordering* and *reporting*, neither of
 * which is observable from the registry: Discord's three-second window is why
 * `deferReply` has to be synchronous, and the suppression count is the only
 * place the Principle II carve-out can be audited from.
 */

interface FakeInteraction {
  channelId: string | null;
  deferReply: ReturnType<typeof vi.fn>;
  editReply: ReturnType<typeof vi.fn>;
  reply: ReturnType<typeof vi.fn>;
}

function fakeInteraction(channelId: string | null): FakeInteraction {
  return {
    channelId,
    deferReply: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    editReply: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    reply: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  };
}

interface DevOutcome {
  delivered: number;
  suppressed: number;
  skipped: boolean;
}

interface ResetOutcome {
  fetched: number;
  seeded: number;
}

/**
 * A platform runtime stub carrying only what `/dev broadcast` consumes.
 *
 * Deliberately *not* annotated `PlatformRuntime`: that would declare
 * `devBroadcast` as a method, and every assertion on it would then trip
 * `unbound-method` for no reason. Inferred as a plain object it is a
 * property, and still assignable to `PlatformRuntime` where it matters.
 */
function runtimeFixture(
  type: string,
  outcome: DevOutcome = { delivered: 1, suppressed: 0, skipped: false },
) {
  return {
    type,
    sync: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    broadcastPending: vi.fn<() => Promise<number>>(() => Promise.resolve(0)),
    devBroadcast: vi.fn<(recipient: string) => Promise<DevOutcome>>(() =>
      Promise.resolve(outcome),
    ),
    reset: vi
      .fn<() => Promise<ResetOutcome>>()
      .mockResolvedValue({ fetched: 0, seeded: 0 }),
  };
}

function call(
  command: DevCommands,
  interaction: FakeInteraction,
): Promise<unknown> {
  return command.onDevBroadcast([
    interaction,
  ] as unknown as SlashCommandContext);
}

function callSync(
  command: DevCommands,
  interaction: FakeInteraction,
  platform: string,
): Promise<unknown> {
  return command.onDevSync(
    [interaction] as unknown as SlashCommandContext,
    { platform } as unknown as PlatformOptionDto,
  );
}

function replyOf(interaction: FakeInteraction): string {
  const [text] = interaction.editReply.mock.calls[0] as [string];
  return text;
}

describe('/dev broadcast interaction contract', () => {
  it('acknowledges with deferReply before any awaited work (R-5.2, SC-011)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const command = new DevCommands([runtimeFixture('epic')]);

    // Deliberately not awaited: the acknowledgement has to already be in
    // flight by the time the handler first yields, otherwise Discord can
    // report "the application did not respond" before any work starts.
    const pending = call(command, interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.editReply).not.toHaveBeenCalled();

    await pending;
  });

  it('answers only through editReply — never a second reply (R-5.2)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const command = new DevCommands([runtimeFixture('epic')]);

    await call(command, interaction);

    expect(interaction.reply).not.toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalledTimes(1);
  });

  it('passes the invocation channel id as the recipient (FR-016)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const runtimes = [runtimeFixture('epic'), runtimeFixture('xbox')];
    const command = new DevCommands(runtimes);

    await call(command, interaction);

    // The recipient is the channel the operator typed in — never a
    // subscription row, and the same value for every platform.
    expect(runtimes[0].devBroadcast).toHaveBeenCalledWith('invocation-channel');
    expect(runtimes[1].devBroadcast).toHaveBeenCalledWith('invocation-channel');
  });

  it('states the suppression count whenever rows were suppressed (R-5.1)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const command = new DevCommands([
      runtimeFixture('epic', { delivered: 1, suppressed: 4, skipped: false }),
    ]);

    await call(command, interaction);

    expect(replyOf(interaction)).toContain('suppressed 4');
    expect(replyOf(interaction)).toContain('delivered 1');
  });

  it('omits the suppression clause when nothing was suppressed', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const command = new DevCommands([
      runtimeFixture('epic', { delivered: 1, suppressed: 0, skipped: false }),
    ]);

    await call(command, interaction);

    expect(replyOf(interaction)).toContain('delivered 1');
    expect(replyOf(interaction)).not.toContain('suppressed');
  });

  it('reports a platform with no eligible row as skipped, still succeeding (FR-007)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const command = new DevCommands([
      runtimeFixture('epic', { delivered: 1, suppressed: 0, skipped: false }),
      runtimeFixture('xbox', { delivered: 0, suppressed: 0, skipped: true }),
    ]);

    await call(command, interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const reply = replyOf(interaction);
    expect(reply).toMatch(/xbox/i);
    expect(reply).toMatch(/skipped/i);
    expect(reply).toMatch(/0 delivered/);
    expect(reply).toMatch(/epic/i);
  });

  it('fails without naming a channel instead of messaging somewhere else', async () => {
    const interaction = fakeInteraction(null);
    const runtimes = [runtimeFixture('epic')];
    const command = new DevCommands(runtimes);

    await call(command, interaction);

    expect(runtimes[0].devBroadcast).not.toHaveBeenCalled();
    expect(replyOf(interaction)).toMatch(/failed/i);
  });

  it('reports a failing platform as a failure, never as a success (§5)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const broken = runtimeFixture('epic');
    broken.devBroadcast = vi
      .fn<(recipient: string) => Promise<DevOutcome>>()
      .mockRejectedValue(new Error('nope'));
    const command = new DevCommands([broken]);

    await call(command, interaction);

    const reply = replyOf(interaction);
    expect(reply).toMatch(/failed/i);
    expect(reply).not.toMatch(/delivered \d/);
  });
});

/**
 * The `/dev sync` reset contract (contracts §5, FR-010 / FR-011 / FR-015).
 *
 * US3 scenario 3 is the one that matters most: a storefront outage must read
 * as a failure with the catalog untouched, never as a reset that emptied it.
 */
describe('/dev sync interaction contract', () => {
  it('acknowledges with deferReply before any awaited work (FR-017)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const runtime = runtimeFixture('epic');
    const command = new DevCommands([runtime]);

    const pending = callSync(command, interaction, 'epic');

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    expect(interaction.deferReply).toHaveBeenCalledWith({
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.editReply).not.toHaveBeenCalled();
    expect(runtime.reset).not.toHaveBeenCalled();

    await pending;
  });

  it('offers exactly the registered platforms, so no other value can arrive (FR-011)', () => {
    const payload = devRoot(register()).toJSON() as unknown as CommandPayload;
    const platform = payload.options
      .find((option) => option.name === 'sync')
      ?.options?.find((option) => option.name === 'platform');

    // The rejection happens on Discord's side: an unregistered type is never
    // offered, so the handler is never invoked for one.
    expect(platform?.choices?.map((choice) => choice.value)).toEqual(
      gameSources.map((source) => source.type),
    );
  });

  it('rejects an unregistered platform without touching any catalog (FR-011)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const runtime = runtimeFixture('xbox');
    const command = new DevCommands([runtime]);

    await callSync(command, interaction, 'epic');

    expect(replyOf(interaction)).toMatch(/failed/i);
    expect(runtime.reset).not.toHaveBeenCalled();
    expect(runtime.sync).not.toHaveBeenCalled();
  });

  it('states how many rows were seeded announced (FR-015, US3 scenario 1)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const runtime = runtimeFixture('epic');
    runtime.reset = vi
      .fn<() => Promise<ResetOutcome>>()
      .mockResolvedValue({ fetched: 5, seeded: 3 });
    const command = new DevCommands([runtime]);

    await callSync(command, interaction, 'epic');

    expect(runtime.reset).toHaveBeenCalledTimes(1);
    const reply = replyOf(interaction);
    expect(reply).toMatch(/epic/i);
    expect(reply).toContain('3 seeded announced');
    expect(reply).toContain('5 fetched');
  });

  it('reports a failed fetch as a failure, not as a reset (FR-010, US3 scenario 3)', async () => {
    const interaction = fakeInteraction('invocation-channel');
    const runtime = runtimeFixture('epic');
    runtime.reset = vi
      .fn<() => Promise<ResetOutcome>>()
      .mockRejectedValue(new Error('storefront is down'));
    const command = new DevCommands([runtime]);

    await callSync(command, interaction, 'epic');

    const reply = replyOf(interaction);
    expect(reply).toMatch(/failed/i);
    expect(reply).toContain('storefront is down');
    expect(reply).not.toContain('seeded announced');
  });
});
