import { Service } from '@/decorators'
import { Subscription as SubscriptionEntity, SubscriptionRepository } from '@/entities'
import { Logger } from '@/services'

@Service()
export class Subscription {

	constructor(
		private logger: Logger,
		private subscription: SubscriptionRepository
	) {
		this.logger.console('Service Subscription invoked !', 'info')
	}

	async add(platform: string, channel: string, guild: string): Promise<void> {
		const subscription = new SubscriptionEntity()
		subscription.channel = channel

	  this.logger.console(`Adding ${platform} subscription for channel ${channel} in guild ${guild}`, 'info')
	}

}