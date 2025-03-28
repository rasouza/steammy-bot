import { Entity, EntityRepositoryType, ManyToOne, OptionalProps, PrimaryKey, PrimaryKeyProp } from '@mikro-orm/core'
import { EntityRepository } from '@mikro-orm/postgresql'

import { CustomBaseEntity } from './BaseEntity'
import { Guild } from './Guild'

// ===========================================
// ================= Entity ==================
// ===========================================

@Entity({ repository: () => SubscriptionRepository, schema: 'steammy_bot' })
export class Subscription extends CustomBaseEntity {

	[EntityRepositoryType]?: SubscriptionRepository
	[PrimaryKeyProp]?: ['id', 'platform', 'guild']
	[OptionalProps]?: 'createdAt' | 'updatedAt'

	// Discord Channel ID
	@PrimaryKey({ autoincrement: false })
	id: string

	@PrimaryKey()
	platform: string

	@ManyToOne({ primary: true })
	guild!: Guild

}

// ===========================================
// =========== Custom Repository =============
// ===========================================

export class SubscriptionRepository extends EntityRepository<Subscription> {

}