import { Category } from '@discordx/utilities'
import { CommandInteraction } from 'discord.js'
import { Client } from 'discordx'

import { Discord, Injectable, Slash, SlashGroup } from '@/decorators'
import { Guard } from '@/guards'
import { Subscription } from '@/services'

@Discord()
@Injectable()
@Category('Gaming')
@SlashGroup({ name: 'subscribe', description: 'News subscription commands' })
@SlashGroup('subscribe')
export default class SubscribeCommand {

	constructor(
		private subscription: Subscription
	) {}

	@Slash({
		name: 'gamepass',
		description: 'Subscribe this channel to receive Game Pass news',
	})
	@Guard()
	async gamepass(
		interaction: CommandInteraction,
		client: Client,
		{ localize }: InteractionData
	) {
		const { channel, guild } = interaction
		if (guild && channel) {
			this.subscription.add('gamepass', channel.id, guild.id)
			interaction.followUp('subscribe command invoked!')
		}
	}

}