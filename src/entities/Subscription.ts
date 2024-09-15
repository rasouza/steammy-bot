import { Entity, EntityRepositoryType, ManyToOne, PrimaryKey, PrimaryKeyProp } from '@mikro-orm/core'
import { EntityRepository } from '@mikro-orm/sqlite'

import { CustomBaseEntity } from './BaseEntity'
import { Guild } from './Guild'

// ===========================================
// ================= Entity ==================
// ===========================================

@Entity({ customRepository: () => SubscriptionRepository })
export class Subscription extends CustomBaseEntity {

	[EntityRepositoryType]?: SubscriptionRepository

	@PrimaryKey({ autoincrement: false })
    id: string

	@PrimaryKey()
		platform: string

	@ManyToOne({ primary: true })
    guild!: Guild

	[PrimaryKeyProp]?: ['id', 'platform', 'guild']

}

// ===========================================
// =========== Custom Repository =============
// ===========================================

export class SubscriptionRepository extends EntityRepository<Subscription> {

}