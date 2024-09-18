import { Category } from '@discordx/utilities'
import { CommandInteraction } from 'discord.js'

import { GamePlatform } from '@/constants'
import { Discord, Injectable, PlatformOption, Slash } from '@/decorators'
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
		@PlatformOption({ description: 'Pick a platform to synchronize' })
		platform: typeof GamePlatform[keyof typeof GamePlatform],
		interaction: CommandInteraction
	) {
		await this[platform].sync()
		interaction.followUp('playground command invoked!')
	}

}