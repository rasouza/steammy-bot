import chalk from 'chalk'
import { Guild, TextChannel } from 'discord.js'

import { Service } from '@/decorators'
import { Subscription as SubscriptionEntity, SubscriptionRepository } from '@/entities'
import { NotFound, SubscriptionAlreadyExists } from '@/errors'
import { Database, Logger } from '@/services'

@Service()
export class Subscription {

	private subscriptionRepository: SubscriptionRepository

	constructor(
		private logger: Logger,
		private db: Database
	) {
		this.logger.console('Service Subscription invoked !', 'info')
		this.subscriptionRepository = this.db.get(SubscriptionEntity)
	}

	async add(platform: string, channel: TextChannel, guild: Guild): Promise<void> {
		try {
			await this.subscriptionRepository.create({
				id: channel.id,
				platform,
				guild: guild.id,
			})

			await this.subscriptionRepository.flush()
			this.logger.console(`Adding ${chalk.bold.green(platform)} subscription for channel ${chalk.bold.blue(`#${channel.name}`)} in guild ${chalk.bold.blue(guild.name)}`, 'info')
		} catch (error: any) {
			if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
				throw new SubscriptionAlreadyExists()
			}
			this.logger.console(`Error adding subscription for channel ${chalk.bold.blue(`#${channel.name}`)} in guild ${chalk.bold.blue(guild.name)}: ${error}`, 'error')
		}
	}

	async remove(platform: string, channel: TextChannel, guild: Guild): Promise<void> {
		try {
			const subscription = await this.subscriptionRepository.findOne({ id: channel.id, guild: guild.id, platform })
			if (!subscription) throw new NotFound('Subscription not found for this channel')

			this.subscriptionRepository.removeAndFlush(subscription)
		} catch (error: any) {
			this.logger.console(`Error removing subscription for channel ${chalk.bold.blue(`#${channel.name}`)} in guild ${chalk.bold.blue(guild.name)}: ${error}`, 'error')
		}
	}

}