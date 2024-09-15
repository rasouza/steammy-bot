type XboxCatalogIdResponse = {
	siglId: string
	title: string
	description: string
	requiresShuffling: string
	imageUrl: string
} | {
	id: string
}

type Image = {
	URI: string
	Width: number
	Height: number
}

type Price = {
	MSRP: string
	SalesPrice: string
	IsFree: boolean
}

type XboxGame = {
	StoreId: string
	ProductTitle: string
	DeveloperName: string
	ImageHero: Image
	Price: Price
	ApproximateSizeInBytes: number
	ProductDescription: string
}