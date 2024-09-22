import { Category } from '@discordx/utilities'
import { ChannelType, CommandInteraction } from 'discord.js'

import { GamePlatform, GamePlatformName } from '@/constants'
import { Discord, Injectable, PlatformOption, Slash } from '@/decorators'
import { NotFound } from '@/errors'
import { Guard } from '@/guards'
import { Subscription } from '@/services'

@Discord()
@Injectable()
@Category('Gaming')
export default class UnsubscribeCommand {

	constructor(
		private subscription: Subscription
	) {}

	@Slash({ name: 'unsubscribe', description: 'Remove subscription from gaming platforms' })
	@Guard()
	async unsubscribe(
		@PlatformOption({ description: 'Pick a platform to unsubscribe' })
		platform: typeof GamePlatform[keyof typeof GamePlatform],
		interaction: CommandInteraction
	) {
		const { channel, guild } = interaction
		try {
			if (guild && channel && channel.type === ChannelType.GuildText) {
				await this.subscription.remove(platform, channel, guild)
				interaction.followUp(`**#${channel.name}** unsubscribed from **${GamePlatformName[platform]}** news`)
			}
		} catch (error) {
			if (error instanceof NotFound) {
				interaction.followUp(`This channel is **not** subscribed to ${GamePlatformName[platform]} news`)
			}
		}
	}

}