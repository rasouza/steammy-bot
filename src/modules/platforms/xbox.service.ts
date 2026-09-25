import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import chalk from 'chalk'
import { merge } from 'object-mapper'
import { Repository } from 'typeorm'
import { CatalogXbox } from '@/database/entities'
import { Game, XboxApiGame, XboxCatalogIdResponse } from '@/shared/types'

const MAPPER_SCHEMA = {
	StoreId: 'id',
	ProductTitle: 'title',
	DeveloperName: 'developer',
	'ImageHero.URI': 'image',
	'Price.MSRP': {
		key: 'price',
		transform: (value: string) =>
			Math.round(Number(value?.slice(1)) * 100) || null,
	},
	ApproximateSizeInBytes: 'size',
	ProductDescription: 'description',
}

@Injectable()
export class XboxService {

	private readonly logger = new Logger(XboxService.name)
	private readonly apiUrl = 'https://catalog.gamepass.com'
	private readonly gameTypeId = 'fdd9e2a7-0fee-49f6-ad69-4354098401ff'
	private readonly language = 'en-US'
	private readonly market = 'US'
	private readonly hydration = 'MobileDetailsForConsole'

	constructor(
		@InjectRepository(CatalogXbox)
		private readonly xboxRepository: Repository<CatalogXbox>,
	) {}

	async fetchGames(): Promise<Game[]> {
		const gameIds = await this.fetchAllIds()
		const gameList = await this.enrichGameCatalog(gameIds)

		this.logger.log(`Fetched ${gameList.length} games from ${chalk.bold.green('Xbox Game Pass')}`)

		return gameList.map(game => merge(game, {} as Game, MAPPER_SCHEMA))
	}

	@Cron('0 * * * *')
	async syncXbox(): Promise<void> {
		try {
			const games = await this.fetchGames()

			if (games.length > 0) {
				await this.xboxRepository.upsert(games as any[], ['id'])
				this.logger.log(`Upserted ${games.length} games into Xbox catalog`)
			}
		} catch (error) {
			this.logger.error(`Failed to sync Xbox Game Pass: ${error instanceof Error ? error.message : error}`)
		}
	}

	private async fetchAllIds(): Promise<string[]> {
		const { data }: { data: XboxCatalogIdResponse[] } = await axios.get(`${this.apiUrl}/sigls/v2`, {
			params: {
				id: this.gameTypeId,
				language: this.language,
				market: this.market,
			},
		})

		const gameIds: string[] = data.reduce((list: string[], game) => {
			if ('id' in game) {
				list.push(game.id)
			}

			return list
		}, [])

		this.logger.log(`[Xbox API] Fetched ${chalk.bold.green(gameIds.length.toString())} IDs`)

		return gameIds
	}

	private async enrichGameCatalog(gameIds: string[]): Promise<XboxApiGame[]> {
		if (gameIds.length === 0) return []

		const body = {
			Products: gameIds,
		}
		const params = {
			params: {
				market: this.market,
				language: this.language,
				hydration: this.hydration,
			},
		}

		const { data } = await axios.post(`${this.apiUrl}/products`, body, params)
		const gameList: XboxApiGame[] = Object.values(data.Products || {})
		this.logger.log(`[Xbox API] Enriched catalog for ${chalk.bold.green(gameIds.length.toString())} IDs`)

		return gameList
	}

}
