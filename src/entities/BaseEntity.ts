import { OptionalProps, Property } from '@mikro-orm/core'

export abstract class CustomBaseEntity {

	[OptionalProps]?: 'createdAt' | 'updatedAt'

	@Property({ defaultRaw: 'CURRENT_TIMESTAMP' })
    createdAt: Date = new Date()

	@Property({ onUpdate: () => new Date(), defaultRaw: 'CURRENT_TIMESTAMP' })
    updatedAt: Date = new Date()

}
