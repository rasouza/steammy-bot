import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity({ name: 'catalog_xbox', schema: 'steammy_bot' })
export class CatalogXbox {

	@PrimaryColumn({ type: 'varchar', length: 255 })
	id: string

	@Column({ type: 'varchar', length: 255 })
	title: string

	@Column({ type: 'bigint', nullable: true })
	price: number | null

	@Column({ type: 'bigint', nullable: true })
	size: number | null

	@Column({ type: 'varchar', length: 255, nullable: true })
	developer: string | null

	@Column({ type: 'varchar', length: 255, nullable: true })
	image: string | null

	@Column({ type: 'text' })
	description: string

	@Column({ type: 'boolean', default: false })
	broadcasted: boolean

	@CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
	createdAt: Date

	@UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
	updatedAt: Date

}
