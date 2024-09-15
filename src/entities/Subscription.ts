import { Entity, EntityRepositoryType, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'
import { EntityRepository } from '@mikro-orm/sqlite'

import { CustomBaseEntity } from './BaseEntity'
import { Guild } from './Guild'

// ===========================================
// ================= Entity ==================
// ===========================================

@Entity({ customRepository: () => SubscriptionRepository })
export class Subscription extends CustomBaseEntity {

	[EntityRepositoryType]?: SubscriptionRepository

	@PrimaryKey()
    id: number

	@Property()
    channel: string

	@ManyToOne()
    guild!: Guild

}

// ===========================================
// =========== Custom Repository =============
// ===========================================

export class SubscriptionRepository extends EntityRepository<Subscription> {

}