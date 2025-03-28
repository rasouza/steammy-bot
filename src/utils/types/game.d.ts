type Game = {
	id: string
	title: string
	developer: string
	description: string
	image?: string
	price?: number
	size?: number
}

type EpicGame = Game & {
	offer_start_at: Date
	offer_end_at: Date
	offer: {
		discount?: number
		upcoming: boolean
	}
}

type XboxGame = Game

// TODO: Write EpicGame (do not forget the offer_start_at and offer_end_at fields)