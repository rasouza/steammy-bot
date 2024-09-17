export const GamePlatform = {
	EPIC: 'epic',
	XBOX: 'xbox',
} as const

export const GamePlatformName = {
	[GamePlatform.EPIC]: 'Epic Games',
	[GamePlatform.XBOX]: 'Xbox Game Pass',
} as const