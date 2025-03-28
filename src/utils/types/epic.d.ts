type EpicApiGame = {
	id: string
	title: string
	description: string
	expiryDate: string
	status: string
	keyImages: EpicApiImage[]
	promotions: {
		promotionalOffers: EpicApiPromotionalOffer[]
		upcomingPromotionalOffers: EpicApiPromotionalOffer[]
	}
	price: EpicApiPrice
}

type EpicApiImage = {
	type: string
	url: string
}

type EpicApiPrice = {
	totalPrice: {
		discountPrice: number
		originalPrice: number
		discount: number
		currencyCode: string
	}
}

type EpicApiPromotionalOffer = {
	promotionalOffers: {
		startDate: string
		endDate: string
		discountSetting: {
			discountType: string
			discountPercentage: number
		}
	}[]
}

type FreeGamesPromotionApiResponse = {
	data: {
		Catalog: {
			searchStore: {
				elements: EpicApiGame[]
			}
		}
	}
}