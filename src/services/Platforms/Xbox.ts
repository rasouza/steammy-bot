import axios from 'axios'
import chalk from 'chalk'
import { merge } from 'object-mapper'

import { xboxConfig } from '@/configs'
import { Service } from '@/decorators'
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
		this.logger.console('Service Broadcast invoked !', 'info')
		this.xboxRepository = this.db.get(XboxCatalog)
	}

	async fetchAllGames() {
		const gameIds = await this.fetchAllIds()
		const gameList = await this.enrichGameCatalog(gameIds)
		await this.sync(gameList)
	}

	async sync(gameList: XboxGame[]) {
		// TODO: Define type of games
		const games = gameList.map(game => merge(game, MAPPER_SCHEMA))

		this.xboxRepository.upsertMany(games)
		this.xboxRepository.flush()
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

	private async enrichGameCatalog(gameIds: string[]) {
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