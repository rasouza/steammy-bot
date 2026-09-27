export const GamePlatform = {
  XBOX: 'xbox',
  EPIC: 'epic',
} as const;

export type GamePlatformType = (typeof GamePlatform)[keyof typeof GamePlatform];

export const GamePlatformName: Record<GamePlatformType, string> = {
  [GamePlatform.XBOX]: 'Xbox Game Pass',
  [GamePlatform.EPIC]: 'Epic Games',
};
