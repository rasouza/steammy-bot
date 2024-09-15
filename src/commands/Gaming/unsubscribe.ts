import { Category } from '@discordx/utilities'
import { ApplicationCommandOptionType, ChannelType, CommandInteraction } from 'discord.js'

import { Discord, Injectable, Slash, SlashChoice, SlashOption } from '@/decorators'
import { SubscriptionAlreadyExists } from '@/errors'
import { Guard } from '@/guards'
import { Subscription } from '@/services'

enum PlatformChoices {
	XboxGamepass = 'Xbox Game Pass',
	EpicGames = 'Epic Games'
}

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
		@SlashChoice({
			name: PlatformChoices.XboxGamepass,
			value: PlatformChoices.XboxGamepass,
		}, {
			name: PlatformChoices.EpicGames,
			value: PlatformChoices.EpicGames,
		})
		@SlashOption({
			description: 'Pick a platform to unsubscribe',
			name: 'platform',
			required: true,
			type: ApplicationCommandOptionType.String,
		})
		platform: string,
		interaction: CommandInteraction
	) {
		const { channel, guild } = interaction
		try {
			if (guild && channel && channel.type === ChannelType.GuildText) {
				await this.subscription.remove(platform, channel, guild)
				interaction.followUp(`**#${channel.name}** unsubscribed from **${platform}** news`)
			}
		} catch (error: any) {
			if (error instanceof SubscriptionAlreadyExists) {
				interaction.followUp(`This channel is already subscribed to ${platform} news`)
			}
		}
	}

}