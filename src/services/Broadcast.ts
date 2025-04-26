import chalk from 'chalk'
import { ChannelType, WebhookMessageCreateOptions } from 'discord.js'
import { Client } from 'discordx'
import { delay, inject } from 'tsyringe'

import { GamePlatform } from '@/constants'
import { Schedule, Service } from '@/decorators'
import { CatalogEpic, CatalogEpicRepository, CatalogXbox, CatalogXboxRepository, Subscription, SubscriptionRepository } from '@/entities'
import { Database, GameEmbed, Logger } from '@/services'

@Service()
export class Broadcast {

	private epicRepository: CatalogEpicRepository
	private xboxRepository: CatalogXboxRepository
	private subscriptionRepository: SubscriptionRepository

	constructor(
		private logger: Logger,
		private db: Database,
		private embed: GameEmbed,
    @inject(delay(() => Client)) private client: Client

	) {
		this.xboxRepository = this.db.get(CatalogXbox)
		this.epicRepository = this.db.get(CatalogEpic)
		this.subscriptionRepository = this.db.get(Subscription)
	}

	@Schedule('10 * * * *')
	async xbox() {
		await this.broadcastXbox()
	}

	@Schedule('10 * * * *')
	async epic() {
		await this.broadcastEpic()
	}

	private async send(message: string, game: Game, platform: typeof GamePlatform[keyof typeof GamePlatform]) {
		const subscriptions = await this.subscriptionRepository.find({ platform })

		const embed = this.embed.build(game)
		const content: WebhookMessageCreateOptions = {
			content: message,
			embeds: [embed],
		}

		for (const subscription of subscriptions) {
			const channel = await this.client.channels.fetch(subscription.id)

			if (channel && channel.type === ChannelType.GuildText) {
				this.logger.console(`Sending ${chalk.bold.green(game.title)} game broadcast to ${chalk.bold.blue(`#${channel.name}`)} in guild ${chalk.bold.blue(channel.guild.name)}`, 'info')
				await channel.send(content)
			}
		}
	}

	private async broadcastEpic() {
		const games = await this.epicRepository.fetchNotBroadcasted()
		if (games.length === 0) {
			this.logger.console(`No new games to broadcast for ${chalk.bold.green('Epic')}`, 'info')

			return
		}

		this.logger.console(`Broadcasting ${games.length} new games for ${chalk.bold.green('Epic')}`, 'info')

		for (const game of games) {
			try {
				await this.send(`New game available on **Epic**`, game, 'epic')
				game.broadcasted = true
			} catch (error: unknown) {
				if (error instanceof Error) {
					this.logger.console(error.message, 'error')
				}

				continue
			}
		}

		await this.db.em.flush()
	}

	private async broadcastXbox() {
		const games = await this.xboxRepository.fetchNotBroadcasted()
		if (games.length === 0) {
			this.logger.console(`No new games to broadcast for ${chalk.bold.green('Xbox')}`, 'info')

			return
		}

		this.logger.console(`Broadcasting ${games.length} new games for ${chalk.bold.green('Xbox')}`, 'info')

		for (const game of games) {
			try {
				await this.send(`New game available on **Xbox**`, game, 'xbox')
				game.broadcasted = true
			} catch (error: unknown) {
				if (error instanceof Error) {
					this.logger.console(error.message, 'error')
				}

				continue
			}
		}

		await this.db.em.flush()
	}

}