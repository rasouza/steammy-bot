import { Reflector } from '@nestjs/core';
import { PermissionFlagsBits } from 'discord.js';
import { SlashCommand, SlashCommandsService, Subcommand } from 'necord';
import type { SlashCommandDiscovery } from 'necord';
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
  options: Array<{ name: string; description: string; options?: unknown[] }>;
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
