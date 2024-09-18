import { ApplicationCommandOptionType } from 'discord.js'

import { GamePlatform, GamePlatformName } from '@/constants'
import { SlashChoice, SlashOption } from '@/decorators'

export function PlatformOption({ description }: { description: string }) {
	return function (target: any, propertyKey: string, parameterIndex: number) {
		for (const platform in GamePlatform) {
			const platformKey = platform as keyof typeof GamePlatform
			// Apply the SlashChoice decorator
			SlashChoice({
				name: GamePlatformName[GamePlatform[platformKey]],
				value: GamePlatform[platformKey],
			})(target, propertyKey, parameterIndex)
		}

		// Apply the SlashOption decorator
		SlashOption({
			description,
			name: 'platform',
			required: true,
			type: ApplicationCommandOptionType.String,
		})(target, propertyKey, parameterIndex)
	}
}