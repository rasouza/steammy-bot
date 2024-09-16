type Game = {
	id: string
	title: string
	developer: string
	description: string
	image?: string
	price?: number
	size?: number
}

type GameWithOffer = Game & {
	offer: {
		startDate?: string
		endDate?: string
		discount?: number
		upcoming: boolean
	}
}