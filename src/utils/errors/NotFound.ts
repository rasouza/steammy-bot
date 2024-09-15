import { BaseError } from '@/utils/classes'

export class NotFound extends BaseError {

	constructor(message = 'Not found') {
		super(message)
	}

	handle() {
		this.logger.console(this.message, 'error')
	}

}
