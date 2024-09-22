import { Category } from '@discordx/utilities'
import { CommandInteraction } from 'discord.js'

import { GamePlatform, GamePlatformName } from '@/constants'
import { Discord, Injectable, PlatformOption, Slash } from '@/decorators'
import { Guard, UserPermissions } from '@/guards'
import { Broadcast } from '@/services'

@Discord()
@Category('Admin')
@Injectable()
export default class BroadcastCommand {

	constructor(
		private broadcast: Broadcast
	) {}

	@Slash({
		name: 'broadcast',
		description: 'Preemptively broadcast games from a platform',
	})
	@Guard(UserPermissions(['Administrator']))
	async send(
		@PlatformOption({ description: 'Pick a platform to broadcast' })
		platform: typeof GamePlatform[keyof typeof GamePlatform],
		interaction: CommandInteraction
	) {
		await this.broadcast[platform]()
		interaction.followUp(`Game catalog broadcasted for **${GamePlatformName[platform]}**`)
	}

}