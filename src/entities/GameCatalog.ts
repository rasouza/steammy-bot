import { Entity, EntityRepositoryType, PrimaryKey, Property } from '@mikro-orm/core'
import { EntityRepository } from '@mikro-orm/sqlite'

import { GamePlatform } from '@/constants'

import { CustomBaseEntity } from './BaseEntity'

// ===========================================
// ================= Entity ==================
// ===========================================

@Entity({ customRepository: () => GameCatalogRepository })
export class GameCatalog extends CustomBaseEntity {

	[EntityRepositoryType]?: GameCatalogRepository

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
		platform: string

}

// ===========================================
// =========== Custom Repository =============
// ===========================================

export class GameCatalogRepository extends EntityRepository<GameCatalog> {

	async fetchNotBroadcasted(platform: typeof GamePlatform[keyof typeof GamePlatform]) {
		return await this.find({ broadcasted: false, platform })
	}

}