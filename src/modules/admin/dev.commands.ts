import { Injectable } from '@nestjs/common';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { Context, Options, SlashCommand, Subcommand } from 'necord';
import type { SlashCommandContext } from 'necord';
import { PlatformOptionDto } from '../subscription/dto/platform-option.dto.js';

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
   */
  @Subcommand({
    name: 'broadcast',
    description: 'Deliver one message per platform into this channel',
  })
  async onDevBroadcast(@Context() [interaction]: SlashCommandContext) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    return interaction.editReply(
      '`/dev broadcast` is not wired up yet (spec 006, User Story 2).',
    );
  }
}
