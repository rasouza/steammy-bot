import { Collection, Entity, EntityRepositoryType, OneToMany, PrimaryKey, Property } from '@mikro-orm/core'
import { EntityRepository } from '@mikro-orm/sqlite'

import { CustomBaseEntity } from './BaseEntity'
import { Subscription } from './Subscription'

// ===========================================
// ================= Entity ==================
// ===========================================

@Entity({ customRepository: () => GuildRepository })
export class Guild extends CustomBaseEntity {

	[EntityRepositoryType]?: GuildRepository

	@PrimaryKey({ autoincrement: false })
    id!: string

	@Property({ nullable: true, type: 'string' })
    prefix: string | null

	@Property()
    deleted: boolean = false

	@Property()
    lastInteract: Date = new Date()

	@OneToMany('Subscription', 'guild')
	subscriptions = new Collection<Subscription>(this)

}

// ===========================================
// =========== Custom Repository =============
// ===========================================

export class GuildRepository extends EntityRepository<Guild> {

	async updateLastInteract(guildId?: string): Promise<void> {
		const guild = await this.findOne({ id: guildId })

		if (guild) {
			guild.lastInteract = new Date()
			await this.flush()
		}
	}

	async getActiveGuilds() {
		return this.find({ deleted: false })
	}

}
