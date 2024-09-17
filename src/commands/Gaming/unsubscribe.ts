import { Category } from '@discordx/utilities'
import { ApplicationCommandOptionType, ChannelType, CommandInteraction } from 'discord.js'

import { GamePlatform, GamePlatformName } from '@/constants'
import { Discord, Injectable, Slash, SlashChoice, SlashOption } from '@/decorators'
import { SubscriptionAlreadyExists } from '@/errors'
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
		@SlashChoice({
			name: 'Epic Games',
			value: GamePlatform.EPIC,
		}, {
			name: 'Xbox Game Pass',
			value: GamePlatform.XBOX,
		})
		@SlashOption({
			description: 'Pick a platform to unsubscribe',
			name: 'platform',
			required: true,
			type: ApplicationCommandOptionType.String,
		})
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
			// FIXME: This error will never happen
			if (error instanceof SubscriptionAlreadyExists) {
				interaction.followUp(`This channel is already subscribed to ${GamePlatformName[platform]} news`)
			}
		}
	}

}