import chalk from 'chalk'
import { WebhookMessageCreateOptions } from 'discord.js'
import { Client } from 'discordx'
import { delay, inject } from 'tsyringe'

import { GamePlatform } from '@/constants'
import { Schedule, Service } from '@/decorators'
import { GameCatalog, GameCatalogRepository, Subscription, SubscriptionRepository } from '@/entities'
import { Database, GameEmbed, Logger } from '@/services'

@Service()
export class Broadcast {

	private gameRepository: GameCatalogRepository
	private subscriptionRepository: SubscriptionRepository

	constructor(
		private logger: Logger,
		private db: Database,
		private embed: GameEmbed,
    @inject(delay(() => Client)) private client: Client

	) {
		this.gameRepository = this.db.get(GameCatalog)
		this.subscriptionRepository = this.db.get(Subscription)
	}

	@Schedule('10 * * * *')
	async gamepass() {
		const games = await this.gameRepository.fetchNotBroadcasted(GamePlatform.XBOX)
		if (games.length === 0) return

		this.logger.console(`Broadcasting ${games.length} new games for ${chalk.bold.green('Xbox Game Pass')}`, 'info')

		for (const game of games) {
			try {
				await this.send('New game available on **Xbox Game Pass**', game)
				game.broadcasted = true
			} catch (error: unknown) {
				if (error instanceof Error) {
					this.logger.console(error.message, 'error')
				}

				continue
			}
		}

		await this.gameRepository.flush()
	}

	@Schedule('10 * * * *')
	async epic() {
		const games = await this.gameRepository.fetchNotBroadcasted(GamePlatform.EPIC)
		if (games.length === 0) return

		this.logger.console(`Broadcasting ${games.length} new games for ${chalk.bold.green('Epic Games')}`, 'info')

		for (const game of games) {
			try {
				await this.send('New game available on **Epic Games**', game)
				game.broadcasted = true
			} catch (error: unknown) {
				if (error instanceof Error) {
					this.logger.console(error.message, 'error')
				}

				continue
			}
		}

		await this.gameRepository.flush()
	}

	private async send(message: string, game: Game) {
		// FIXME: Need to filter by platform
		const subscriptions = await this.subscriptionRepository.findAll()

		const embed = this.embed.build(game)
		// TODO: Abstract to other Game platforms
		const content: WebhookMessageCreateOptions = {
			content: message,
			embeds: [embed],
		}

		for (const subscription of subscriptions) {
			const channel = await this.client.channels.fetch(subscription.id)

			if (channel?.isTextBased()) {
				await channel.send(content)
			}
		}
	}

}