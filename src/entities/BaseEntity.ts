import { Opt, Property } from '@mikro-orm/core'

export abstract class CustomBaseEntity {

	@Property({ defaultRaw: 'CURRENT_TIMESTAMP' })
	createdAt: Date & Opt = new Date()

	@Property({ onUpdate: () => new Date(), defaultRaw: 'CURRENT_TIMESTAMP' })
	updatedAt: Date & Opt = new Date()

}
