import { Entity, EntityRepositoryType, PrimaryKey, Property } from '@mikro-orm/core'
import { EntityRepository } from '@mikro-orm/postgresql'

import { GamePlatform } from '@/constants'

import { CustomBaseEntity } from './BaseEntity'

// ===========================================
// ================= Entity ==================
// ===========================================

@Entity({ repository: () => CatalogXboxRepository, schema: 'steammy_bot' })
export class CatalogXbox extends CustomBaseEntity {

	[EntityRepositoryType]?: CatalogXboxRepository

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

}

// ===========================================
// =========== Custom Repository =============
// ===========================================

export class CatalogXboxRepository extends EntityRepository<CatalogXbox> {

	async fetchNotBroadcasted() {
		return await this.find({ broadcasted: false })
	}

}