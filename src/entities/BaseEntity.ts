import { OptionalProps, Property } from '@mikro-orm/core'

export abstract class CustomBaseEntity {

	[OptionalProps]?: 'createdAt' | 'updatedAt'

	@Property()
    createdAt: Date = new Date()

	@Property({ onUpdate: () => new Date() })
    updatedAt: Date = new Date()

}
