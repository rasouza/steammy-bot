type XboxCatalogIdResponse = {
	siglId: string
	title: string
	description: string
	requiresShuffling: string
	imageUrl: string
} | {
	id: string
}

type XboxApiImage = {
	URI: string
	Width: number
	Height: number
}

type XboxApiPrice = {
	MSRP: string
	SalesPrice: string
	IsFree: boolean
}

type XboxApiGame = {
	StoreId: string
	ProductTitle: string
	DeveloperName: string
	ImageHero: XboxApiImage
	Price: XboxApiPrice
	ApproximateSizeInBytes: number
	ProductDescription: string
}