type EpicGame = {
	id: string
	title: string
	description: string
	expiryDate: string
	status: string
	keyImages: EpicImage[]
	promotions: {
		promotionalOffers: EpicPromotionalOffer[]
		upcomingPromotionalOffers: EpicPromotionalOffer[]
	}
	price: EpicPrice
}

type EpicImage = {
	type: string
	url: string
}

type EpicPrice = {
	totalPrice: {
		discountPrice: number
		originalPrice: number
		discount: number
		currencyCode: string
	}
}

type EpicPromotionalOffer = {
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
				elements: EpicGame[]
			}
		}
	}
}