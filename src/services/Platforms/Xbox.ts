import axios from 'axios'
import chalk from 'chalk'
import { merge } from 'object-mapper'

import { xboxConfig } from '@/configs'
import { Schedule, Service } from '@/decorators'
import { XboxCatalog, XboxCatalogRepository } from '@/entities'
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

	private xboxRepository: XboxCatalogRepository

	constructor(
		private logger: Logger,
		private db: Database
	) {
		this.xboxRepository = this.db.get(XboxCatalog)
	}

	async fetchGames(): Promise<Game[]> {
		// Placeholder is to ensure type safety when merging
		let gamePlaceholder: Game

		const gameIds = await this.fetchAllIds()
		const gameList = await this.enrichGameCatalog(gameIds)

		return gameList.map(game => merge(game, gamePlaceholder, MAPPER_SCHEMA))
	}

	@Schedule('0 * * * *')
	async sync() {
		const games = await this.fetchGames()
		this.xboxRepository.upsertMany(games)

		await this.xboxRepository.flush()
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

		this.logger.console(`Fetched ${chalk.bold.green('Xbox')} catalog: ${gameIds.length} entries`, 'info')

		return gameIds
	}

	private async enrichGameCatalog(gameIds: string[]): Promise<XboxGame[]> {
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

		const gameList: XboxGame[] = Object.values(data.Products)

		return gameList
	}

}