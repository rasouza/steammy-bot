import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import axios from 'axios'
import chalk from 'chalk'
import { merge } from 'object-mapper'
import { Repository } from 'typeorm'
import { CatalogEpic } from '@/database/entities'
import { EpicApiGame, EpicGame, FreeGamesPromotionApiResponse, Game } from '@/shared/types'

const isDeveloper = (item: any) => item.key === 'developerName'
const isThumbnail = (item: any) => item.type === 'Thumbnail'
const isEmpty = (element: object) => element?.constructor === Object && Object.keys(element).length === 0

const MAPPER_SCHEMA = {
	title: 'title',
	id: 'id',
	description: 'description',
	'price.totalPrice.originalPrice': 'price',
	'promotions.promotionalOffers[0].promotionalOffers[0].startDate': 'offer_start_at',
	'promotions.promotionalOffers[0].promotionalOffers[0].endDate': 'offer_end_at',
	'promotions.upcomingPromotionalOffers[0].promotionalOffers[0].startDate': 'offer_start_at',
	'promotions.upcomingPromotionalOffers[0].promotionalOffers[0].endDate': 'offer_end_at',
	'promotions.upcomingPromotionalOffers[0].promotionalOffers[0].discountSetting.discountPercentage': 'offer.discount',
	promotions: {
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
}

@Injectable()
export class EpicService {

	private readonly logger = new Logger(EpicService.name)
	private readonly apiUrl = 'https://store-site-backend-static-ipv4.ak.epicgames.com'

	constructor(
		@InjectRepository(CatalogEpic)
		private readonly epicRepository: Repository<CatalogEpic>,
	) {}

	async fetchGames(): Promise<Game[]> {
		const gameList = await this.fetchCatalog()

		const games = gameList.reduce((list: Game[], gameEntry) => {
			const game = merge(gameEntry, MAPPER_SCHEMA) as EpicGame

			if (game.offer?.upcoming && game.offer.discount === 0) {
				const { offer: _, ...gameWithoutOffer } = game
				list.push(gameWithoutOffer)
			}

			return list
		}, [])

		this.logger.log(`[Epic Game API] Fetched ${games.length} games from ${chalk.bold.green('Epic Games')}`)

		return games
	}

	@Cron('0 * * * *')
	async syncEpic(): Promise<void> {
		try {
			const games = await this.fetchGames()

			if (games.length > 0) {
				await this.epicRepository.upsert(games as any[], ['id'])
				this.logger.log(`Upserted ${games.length} games into Epic catalog`)
			}
		} catch (error) {
			this.logger.error(`Failed to sync Epic Games: ${error instanceof Error ? error.message : error}`)
		}
	}

	private async fetchCatalog(): Promise<EpicApiGame[]> {
		const { data }: { data: FreeGamesPromotionApiResponse } = await axios.get(
			`${this.apiUrl}/freeGamesPromotions`,
		)

		return data.data.Catalog.searchStore.elements
	}

}
