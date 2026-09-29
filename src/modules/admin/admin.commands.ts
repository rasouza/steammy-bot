import { Inject, Injectable } from '@nestjs/common';
import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { Context, Options, SlashCommand } from 'necord';
import type { SlashCommandContext } from 'necord';
import { GamePlatformName } from '../platforms/platform.constants.js';
import type { GamePlatformType } from '../platforms/platform.constants.js';
import { PLATFORM_REGISTRY } from '../platforms/platform.tokens.js';
import type { PlatformRuntime } from '../platforms/platform.types.js';
import { PlatformOptionDto } from '../subscription/dto/platform-option.dto.js';

/**
 * Admin commands resolve their target from the platform registry instead of
 * branching on `platform === ...` (spec A-002, FR-011). Reply wording,
 * ephemeral flags, and `GamePlatformName` lookups are unchanged (FR-015).
 */
@Injectable()
export class AdminCommands {
  constructor(
    @Inject(PLATFORM_REGISTRY) private readonly registry: PlatformRuntime[],
  ) {}

  private runtime(type: GamePlatformType): PlatformRuntime {
    const runtime = this.registry.find((platform) => platform.type === type);

    if (!runtime) {
      throw new Error(`Platform is not registered: ${type}`);
    }

    return runtime;
  }

  @SlashCommand({
    name: 'sync',
    description: 'Synchronize games catalog from a platform',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    dmPermission: false,
  })
  async onSync(
    @Context() [interaction]: SlashCommandContext,
    @Options() { platform }: PlatformOptionDto,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await this.runtime(platform).sync();

      return interaction.editReply(
        `**${GamePlatformName[platform]}** catalog synchronized successfully.`,
      );
    } catch (error) {
      return interaction.editReply(
        `Failed to sync ${GamePlatformName[platform]}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  @SlashCommand({
    name: 'broadcast',
    description: 'Manually trigger game broadcasts for a platform',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    dmPermission: false,
  })
  async onBroadcast(
    @Context() [interaction]: SlashCommandContext,
    @Options() { platform }: PlatformOptionDto,
  ) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const count = await this.runtime(platform).broadcastPending();

      return interaction.editReply(
        `Broadcasted ${count} games for **${GamePlatformName[platform]}**.`,
      );
    } catch (error) {
      return interaction.editReply(
        `Failed to broadcast ${GamePlatformName[platform]}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
