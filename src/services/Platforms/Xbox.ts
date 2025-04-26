import axios from 'axios'
import chalk from 'chalk'
import { merge } from 'object-mapper'

import { xboxConfig } from '@/configs'
import { Schedule, Service } from '@/decorators'
import { CatalogXbox, CatalogXboxRepository } from '@/entities'
import { Database, Logger } from '@/services'

const MAPPER_SCHEMA = {
	'StoreId': 'id',
	'ProductTitle': 'title',
	'DeveloperName': 'developer',
	'ImageHero.URI': 'image',
	'Price.MSRP': {
		key: 'price',
		transform: (value: string) =>
			Math.round(Number(value?.slice(1)) * 100) || null,
	},
	'ApproximateSizeInBytes': 'size',
	'ProductDescription': 'description',
}

@Service()
export class Xbox {

	private xboxRepository: CatalogXboxRepository

	constructor(
		private logger: Logger,
		private db: Database
	) {
		this.xboxRepository = this.db.get(CatalogXbox)
	}

	async fetchGames(): Promise<Game[]> {
		const gameIds = await this.fetchAllIds()
		const gameList = await this.enrichGameCatalog(gameIds)

		this.logger.console(`Fetched ${gameList.length} games from ${chalk.bold.green('Xbox Game Pass')}`, 'info')

		return gameList.map(game => merge(game, {} as Game, MAPPER_SCHEMA))
	}

	@Schedule('0 * * * *')
	async syncXbox() {
		const games = await this.fetchGames()
		this.xboxRepository.upsertMany(games)

		await this.db.em.flush()
	}

	private async fetchAllIds() {
		const { apiUrl, gameTypeId, language, market } = xboxConfig
		const { data }: { data: XboxCatalogIdResponse[] } = await axios.get(`${apiUrl}/sigls/v2`, { params: {
			id: gameTypeId,
			language,
			market,
		} })

		const gameIds: string[] = data.reduce((list: string[], game) => {
			if ('id' in game) {
				list.push(game.id)
			}

			return list
		}, [])

		this.logger.console(`[Xbox API] Fetched ${chalk.bold.green(gameIds.length)} IDs`, 'info')

		return gameIds
	}

	private async enrichGameCatalog(gameIds: string[]): Promise<XboxApiGame[]> {
		const { apiUrl, language, market, hydration } = xboxConfig

		const body = {
			Products: gameIds,
		}
		const params = {
			params: {
				market,
				language,
				hydration,
			},
		}

		const { data } = await axios.post(`${apiUrl}/products`, body, params)
		const gameList: XboxApiGame[] = Object.values(data.Products)
		this.logger.console(`[Xbox API] Enriched catalog for ${chalk.bold.green(gameIds.length)} IDs`, 'info')

		return gameList
	}

}