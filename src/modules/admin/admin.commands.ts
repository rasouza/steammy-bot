import { Injectable } from '@nestjs/common'
import { PermissionFlagsBits } from 'discord.js'
import { Context, Options, SlashCommand, SlashCommandContext } from 'necord'
import { BroadcastService } from '@/modules/broadcast/broadcast.service'
import { EpicService } from '@/modules/platforms/epic.service'
import { XboxService } from '@/modules/platforms/xbox.service'
import { PlatformOptionDto } from '@/modules/subscription/dto/platform-option.dto'
import { GamePlatform, GamePlatformName } from '@/shared/constants'

@Injectable()
export class AdminCommands {

	constructor(
		private readonly epicService: EpicService,
		private readonly xboxService: XboxService,
		private readonly broadcastService: BroadcastService,
	) {}

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
		await interaction.deferReply({ ephemeral: true })

		try {
			if (platform === GamePlatform.XBOX) {
				await this.xboxService.syncXbox()
			} else if (platform === GamePlatform.EPIC) {
				await this.epicService.syncEpic()
			}

			return interaction.editReply(`**${GamePlatformName[platform]}** catalog synchronized successfully.`)
		} catch (error) {
			return interaction.editReply(
				`Failed to sync ${GamePlatformName[platform]}: ${error instanceof Error ? error.message : 'Unknown error'}`,
			)
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
		await interaction.deferReply({ ephemeral: true })

		try {
			let count = 0
			if (platform === GamePlatform.EPIC) {
				count = await this.broadcastService.broadcastEpic()
			} else if (platform === GamePlatform.XBOX) {
				count = await this.broadcastService.broadcastXbox()
			}

			return interaction.editReply(`Broadcasted ${count} games for **${GamePlatformName[platform]}**.`)
		} catch (error) {
			return interaction.editReply(
				`Failed to broadcast ${GamePlatformName[platform]}: ${error instanceof Error ? error.message : 'Unknown error'}`,
			)
		}
	}

}
