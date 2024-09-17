import { Category } from '@discordx/utilities'
import { ApplicationCommandOptionType, CommandInteraction } from 'discord.js'

import { GamePlatform } from '@/constants'
import { Discord, Injectable, Slash, SlashChoice, SlashOption } from '@/decorators'
import { Guard, UserPermissions } from '@/guards'
import { Epic, Xbox } from '@/services'

@Discord()
@Category('Gaming')
@Injectable()
export default class SyncCommand {

	constructor(
		private xbox: Xbox,
		private epic: Epic
	) {}

	@Slash({
		name: 'sync',
		description: 'Synchronize games from a platform',
	})
	@Guard(
		UserPermissions(['Administrator'])
	)
	async sync(
		@SlashChoice({
			name: 'Epic Games',
			value: GamePlatform.EPIC,
		}, {
			name: 'Xbox Game Pass',
			value: GamePlatform.XBOX,
		})
		@SlashOption({
			description: 'Pick a platform to synchronize',
			name: 'platform',
			required: true,
			type: ApplicationCommandOptionType.String,
		})
		platform: typeof GamePlatform[keyof typeof GamePlatform],
		interaction: CommandInteraction
	) {
		await this[platform].sync()
		interaction.followUp('playground command invoked!')
	}

}