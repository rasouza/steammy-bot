import { Entity, EntityRepositoryType, PrimaryKey, Property } from '@mikro-orm/core'
import { EntityRepository } from '@mikro-orm/sqlite'

import { CustomBaseEntity } from './BaseEntity'

// ===========================================
// ================= Entity ==================
// ===========================================

@Entity({ customRepository: () => XboxCatalogRepository })
export class XboxCatalog extends CustomBaseEntity {

	[EntityRepositoryType]?: XboxCatalogRepository

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

export class XboxCatalogRepository extends EntityRepository<XboxCatalog> {

}