import { Entity, EntityRepositoryType, PrimaryKey, Property } from '@mikro-orm/core'
import { EntityRepository } from '@mikro-orm/sqlite'

import { CustomBaseEntity } from './BaseEntity'

// ===========================================
// ================= Entity ==================
// ===========================================

@Entity({ customRepository: () => EpicCatalogRepository })
export class EpicCatalog extends CustomBaseEntity {

	[EntityRepositoryType]?: EpicCatalogRepository

	@PrimaryKey({ autoincrement: false })
    id: string

	@Property()
    title: string

	@Property({ nullable: true })
    price: number

	@Property({ nullable: true })
    size: number

	@Property({ nullable: true })
    developer: string

	@Property({ nullable: true })
    image: string

	@Property()
    description: string

	@Property({ default: false })
    broadcasted: boolean

}

// ===========================================
// =========== Custom Repository =============
// ===========================================

export class EpicCatalogRepository extends EntityRepository<EpicCatalog> {

	async fetchNotBroadcasted() {
		return await this.find({ broadcasted: false })
	}

}