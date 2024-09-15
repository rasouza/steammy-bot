import { BaseError } from '@/utils/classes'

export class SubscriptionAlreadyExists extends BaseError {

	constructor() {
		super('This subscription already exists')
	}

	handle() {
		this.logger.console(this.message, 'error')
	}

}
