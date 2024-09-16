type XboxCatalogIdResponse = {
	siglId: string
	title: string
	description: string
	requiresShuffling: string
	imageUrl: string
} | {
	id: string
}

type XboxImage = {
	URI: string
	Width: number
	Height: number
}

type XboxPrice = {
	MSRP: string
	SalesPrice: string
	IsFree: boolean
}

type XboxGame = {
	StoreId: string
	ProductTitle: string
	DeveloperName: string
	ImageHero: XboxImage
	Price: XboxPrice
	ApproximateSizeInBytes: number
	ProductDescription: string
}