import axios from 'axios'
import chalk from 'chalk'
import { merge } from 'object-mapper'

import { epicConfig } from '@/configs'
import { Schedule, Service } from '@/decorators'
import { GameCatalog, GameCatalogRepository } from '@/entities'
import { Database, Logger } from '@/services'

const isDeveloper = (item: any) => item.key === 'developerName'
const isThumbnail = (item: any) => item.type === 'Thumbnail'
const isEmpty = (element: object) => element?.constructor === Object && Object.keys(element).length === 0

const MAPPER_SCHEMA = {
	'title': 'title',
	'id': 'id',
	'description': 'description',
	'price.totalPrice.originalPrice': 'price',
	'promotions.promotionalOffers[0].promotionalOffers[0].startDate':
    'offer.startDate',
	'promotions.promotionalOffers[0].promotionalOffers[0].endDate':
    'offer.endDate',
	'promotions.upcomingPromotionalOffers[0].promotionalOffers[0].startDate':
		'offer.startDate',
	'promotions.upcomingPromotionalOffers[0].promotionalOffers[0].endDate':
		'offer.endDate',
	'promotions.upcomingPromotionalOffers[0].promotionalOffers[0].discountSetting.discountPercentage':
		'offer.discount',
	'promotions': {
		key: 'offer.upcoming',
		transform: (value: any) => {
			const { promotionalOffers, upcomingPromotionalOffers } = value || {}
			if (isEmpty(promotionalOffers) && isEmpty(upcomingPromotionalOffers))
				return

			return upcomingPromotionalOffers?.length > 0
		},
	},
	'customAttributes[]': {
		key: 'developer',
		transform(value: any) {
			if (Array.isArray(value)) {
				const developer = value.filter(isDeveloper)
				if (developer.length > 0) {
					return developer[0].value
				}
			}
		},
	},
	'keyImages[]': {
		key: 'image',
		transform: (value: any) => {
			if (isEmpty(value)) return
			const image = value.filter(isThumbnail)[0]?.url

			return image
		},
	},
	'nonExistentField': {
		key: 'platform',
		transform: () => 'epic',
	},
}

@Service()
export class Epic {

	private gameRepository: GameCatalogRepository

	constructor(
		private logger: Logger,
		private db: Database
	) {
		this.gameRepository = this.db.get(GameCatalog)
	}

	async fetchGames(): Promise<Game[]> {
		const gameList = await this.fetchCatalog()

		const games = gameList.reduce((list: Game[], gameEntry) => {
			const game = merge(gameEntry, MAPPER_SCHEMA) as GameWithOffer

			if (game.offer.upcoming && game.offer.discount === 0) {
				// FIXME: Remove offer property for MikrORM upsert.
				// On later version of MikroORM, it's possible to omit the offer property
				const { offer: _, ...gameWithoutOffer } = game
				list.push(gameWithoutOffer)
			}

			return list
		}, [])

		this.logger.console(`[Epic Game API] Fetched ${games.length} games from ${chalk.bold.green('Epic Games')}`, 'info')

		return games
	}

	@Schedule('0 * * * *')
	async sync() {
		const games = await this.fetchGames()

		this.gameRepository.upsertMany(games)

		await this.gameRepository.flush()
	}

	private async fetchCatalog(): Promise<EpicGame[]> {
		const { apiUrl } = epicConfig
		const { data }: { data: FreeGamesPromotionApiResponse } = await axios.get(`${apiUrl}/freeGamesPromotions`)

		return data.data.Catalog.searchStore.elements
	}

}