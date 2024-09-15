import chalk from 'chalk'
import { WebhookMessageCreateOptions } from 'discord.js'
import { Client } from 'discordx'
import { delay, inject } from 'tsyringe'

import { Schedule, Service } from '@/decorators'
import { Subscription, SubscriptionRepository, XboxCatalog, XboxCatalogRepository } from '@/entities'
import { Database, GameEmbed, Logger } from '@/services'

@Service()
export class Broadcast {

	private xboxRepository: XboxCatalogRepository
	private subscriptionRepository: SubscriptionRepository

	constructor(
		private logger: Logger,
		private db: Database,
		private embed: GameEmbed,
    @inject(delay(() => Client)) private client: Client

	) {
		this.logger.console('Service Broadcast invoked !', 'info')
		this.xboxRepository = this.db.get(XboxCatalog)
		this.subscriptionRepository = this.db.get(Subscription)
	}

	@Schedule('* * * * *')
	async gamepass() {
		const games = await this.xboxRepository.fetchNotBroadcasted()
		this.logger.console(`Broadcasting ${games.length} new games for ${chalk.bold.green('Xbox Game Pass')}`, 'info')
		try {
			games.forEach(async (game) => {
				await this.send(game)
				game.broadcasted = true
			})

			await this.xboxRepository.flush()
		} catch (error) {

		}
	}

	// TODO: Define type of games
	private async send(game: any) {
		const subscriptions = await this.subscriptionRepository.findAll()

		const embed = this.embed.build(game)
		// TODO: Abstract to other Game platforms
		const content: WebhookMessageCreateOptions = {
			content: 'New game available on Xbox Game Pass',
			embeds: [embed],
		}

		subscriptions.forEach(async (subscription) => {
			const channel = await this.client.channels.fetch(subscription.id)

			if (channel?.isTextBased()) {
				await channel.send(content)
			}
		})
	}

}