import { Entity, EntityRepositoryType, PrimaryKey, Property } from '@mikro-orm/core'
import { EntityRepository } from '@mikro-orm/postgresql'

import { GamePlatform } from '@/constants'

import { CustomBaseEntity } from './BaseEntity'

// ===========================================
// ================= Entity ==================
// ===========================================

@Entity({ repository: () => CatalogEpicRepository, schema: 'steammy_bot' })
export class CatalogEpic extends CustomBaseEntity {

	[EntityRepositoryType]?: CatalogEpicRepository

	// TODO: Use AutoIncrement ID to avoid conflicts between platform IDs
	@PrimaryKey({ autoincrement: false })
	id: string

	@Property()
	title: string

	@Property({ columnType: 'int8', nullable: true })
	price: number

	@Property({ columnType: 'int8', nullable: true })
	size: number

	@Property({ nullable: true })
	developer: string

	@Property({ nullable: true })
	image: string

	@Property({ columnType: 'text' })
	description: string

	@Property({ default: false })
	broadcasted: boolean

	@Property()
	offer_start_at: Date

	@Property()
	offer_end_at: Date

}

// ===========================================
// =========== Custom Repository =============
// ===========================================

export class CatalogEpicRepository extends EntityRepository<CatalogEpic> {

	async fetchNotBroadcasted() {
		return await this.find({ broadcasted: false, offer_start_at: { $lte: new Date() }, offer_end_at: { $gte: new Date() } })
	}

}