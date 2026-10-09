import { Inject, Injectable } from '@nestjs/common';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { Context, Options, SlashCommand, Subcommand } from 'necord';
import type { SlashCommandContext } from 'necord';
import { gameSources } from '../../gamesources/index.js';
import { PlatformOptionDto } from '../subscription/dto/platform-option.dto.js';
import { PLATFORM_REGISTRY } from '../platforms/platform.tokens.js';
import type {
  DevBroadcastOutcome,
  PlatformRuntime,
} from '../platforms/platform.types.js';

/** Display name for a runtime's type, falling back to the raw key. */
function displayName(type: string): string {
  return gameSources.find((source) => source.type === type)?.name ?? type;
}

/**
 * One reply line (contracts §5 / R-5.1).
 *
 * The suppression clause only appears when rows really were marked announced
 * without being delivered — stating a count that does not exist would be its
 * own contract violation.
 */
function describe(outcome: DevBroadcastOutcome, name: string): string {
  if (outcome.skipped) {
    return `${name}: skipped (0 delivered)`;
  }

  const suppression =
    outcome.suppressed > 0 ? `, suppressed ${outcome.suppressed}` : '';

  return `${name}: delivered ${outcome.delivered}${suppression}`;
}

/**
 * The `/dev` smoke commands (specs/006-dev-smoke-commands).
 *
 * Registration scope is **not** decided here: `CommandScopeService` pins the
 * `dev` root to `TEST_GUILD_ID` and removes it outright outside a local
 * development run (FR-001, FR-014), so this class can assume it only ever
 * runs inside the test guild. Permission and DM metadata sit on the root, so
 * one declaration covers both subcommands (FR-004 / contracts G4).
 *
 * One root with two subcommands, not two roots: Discord forbids spaces in
 * root names, and removing the single `dev` root drops both subcommands in
 * one call (research R2).
 *
 * **`@SlashCommand` belongs on the class, not on a method.** Necord resolves a
 * subcommand's root with `reflector.get(SlashCommand.KEY, subcommand.getClass())`
 * — a lookup on the *class* — so a method-level root is unreachable from there
 * and `SlashCommandsService.addSubCommand()` throws
 * `"A subcommand must belong to a root slash command."` at boot. A class-level
 * root is also never explored as a handler, which is safe only because
 * `SlashCommandDiscovery.execute()` routes to a subcommand whenever one
 * exists and never calls the root's own. `dev.commands.spec.ts` pins both
 * halves of that contract.
 */
@Injectable()
@SlashCommand({
  name: 'dev',
  description: 'Developer smoke-test commands (test guild only)',
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
  dmPermission: false,
})
export class DevCommands {
  constructor(
    @Inject(PLATFORM_REGISTRY) private readonly registry: PlatformRuntime[],
  ) {}

  /**
   * US3 — replaces a platform's catalog with a fresh storefront snapshot and
   * marks it announced so the scheduled pass stays silent.
   */
  @Subcommand({
    name: 'sync',
    description: 'Reset a platform catalog from the storefront',
  })
  async onDevSync(
    @Context() [interaction]: SlashCommandContext,
    @Options() _options: PlatformOptionDto,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    return interaction.editReply(
      '`/dev sync` is not wired up yet (spec 006, User Story 3).',
    );
  }

  /**
   * US2 — delivers exactly one message per platform into the channel the
   * command was invoked from, reading no subscription row.
   *
   * The reply carries what contracts §5 obliges: a line per platform, an
   * explicit suppression count whenever rows were marked announced without
   * being delivered (FR-015), and a skipped platform reported as skipped
   * rather than as a failure (FR-007).
   */
  @Subcommand({
    name: 'broadcast',
    description: 'Deliver one message per platform into this channel',
  })
  async onDevBroadcast(@Context() [interaction]: SlashCommandContext) {
    // FR-017 / R-5.2: the acknowledgement comes first and synchronously —
    // no platform work happens before it, so Discord never reaches its
    // roughly three-second window. `editReply` is then the only response.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // The invocation channel *is* the audience (FR-016): the recipient comes
    // from the interaction, never from a subscription row.
    const recipient = interaction.channelId;

    if (!recipient) {
      // Refusing beats sending somewhere the operator did not ask for.
      return interaction.editReply(
        'Dev broadcast failed: this command must be run inside a server channel.',
      );
    }

    try {
      // Sequential on purpose: one platform at a time, in registry order, so
      // the reply lines always match the order they were run in.
      const lines: string[] = [];

      for (const runtime of this.registry) {
        const outcome = await runtime.devBroadcast(recipient);
        lines.push(describe(outcome, displayName(runtime.type)));
      }

      return interaction.editReply(
        [`Dev broadcast into <#${recipient}>:`, ...lines].join('\n'),
      );
    } catch (error) {
      // §5 Failure: the invocation reports a failure; a partial pass is
      // never dressed up as a success.
      return interaction.editReply(
        `Dev broadcast failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
