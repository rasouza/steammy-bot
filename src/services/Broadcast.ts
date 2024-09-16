import chalk from 'chalk'
import { WebhookMessageCreateOptions } from 'discord.js'
import { Client } from 'discordx'
import { delay, inject } from 'tsyringe'

import { Schedule, Service } from '@/decorators'
import { EpicCatalog, EpicCatalogRepository, Subscription, SubscriptionRepository, XboxCatalog, XboxCatalogRepository } from '@/entities'
import { Database, GameEmbed, Logger } from '@/services'

@Service()
export class Broadcast {

	private xboxRepository: XboxCatalogRepository
	private epicRepository: EpicCatalogRepository
	private subscriptionRepository: SubscriptionRepository

	constructor(
		private logger: Logger,
		private db: Database,
		private embed: GameEmbed,
    @inject(delay(() => Client)) private client: Client

	) {
		this.xboxRepository = this.db.get(XboxCatalog)
		this.epicRepository = this.db.get(EpicCatalog)
		this.subscriptionRepository = this.db.get(Subscription)
	}

	@Schedule('10 * * * *')
	async gamepass() {
		const games = await this.xboxRepository.fetchNotBroadcasted()
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

		await this.xboxRepository.flush()
	}

	@Schedule('10 * * * *')
	async epic() {
		const games = await this.epicRepository.fetchNotBroadcasted()
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

		await this.epicRepository.flush()
	}

	private async send(message: string, game: Game) {
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