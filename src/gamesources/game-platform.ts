/**
 * Domain keys for the platform area — the shared `GamePlatform` union every
 * GameSource folder declares against (spec FR-001; plan research R1). The
 * machinery never imports this file (SC-003's single bridge is the central
 * registration list); Discord choices and external consumers type against it.
 * Registration data — display names, definitions — lives inside each
 * platform's own subfolder; this file holds only the key vocabulary.
 */

export const GamePlatform = {
  XBOX: 'xbox',
  EPIC: 'epic',
} as const;

export type GamePlatformType = (typeof GamePlatform)[keyof typeof GamePlatform];
