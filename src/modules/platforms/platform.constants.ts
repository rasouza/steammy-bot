/**
 * Platform identity vocabulary, moved out of the retired shared constants file
 * (research R11) so it sits next to the registry it feeds. Adding a
 * storefront extends this file — it is registration-layer configuration,
 * not generic logic (spec FR-003 / A-002).
 */

export const GamePlatform = {
  XBOX: 'xbox',
  EPIC: 'epic',
} as const;

export type GamePlatformType = (typeof GamePlatform)[keyof typeof GamePlatform];

export const GamePlatformName: Record<GamePlatformType, string> = {
  [GamePlatform.XBOX]: 'Xbox Game Pass',
  [GamePlatform.EPIC]: 'Epic Games',
};
