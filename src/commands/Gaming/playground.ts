import { Category } from '@discordx/utilities'
import { CommandInteraction } from 'discord.js'

import { Discord, Injectable, Slash } from '@/decorators'
import { Guard } from '@/guards'
import { Xbox } from '@/services'

@Discord()
@Category('Gaming')
@Injectable()
export default class PlaygroundCommand {

	constructor(
		private xbox: Xbox
	) {}

	@Slash({
		name: 'playground',
		description: 'Here goes the command description!',
	})
	@Guard()
	async playground(
		interaction: CommandInteraction
	) {
		await this.xbox.fetchAllGames()
		interaction.followUp('playground command invoked!')
	}

}