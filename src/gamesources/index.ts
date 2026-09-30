import { EPIC_PLATFORM } from './epic/index.js';
import type { GamePlatformType } from './game-platform.js';
import { XBOX_PLATFORM } from './xbox/index.js';

/**
 * The central registration list — the one explicitly registered file a
 * platform-add edits outside its own subfolder (spec FR-003), and the only
 * bridge the machinery consumes (SC-003). Explicit registration, no filesystem
 * auto-discovery: type-safe and understandable in a small app (plan research R2).
 */
export const gameSources = [EPIC_PLATFORM, XBOX_PLATFORM] as const;

/**
 * Display names derived from the definitions — single source of truth, no
 * separate name record (plan research R1). Typed as the full domain union, so
 * a definition missing from `gameSources` fails to compile.
 */
export const gameSourceNames: Record<GamePlatformType, string> = {
  [EPIC_PLATFORM.type]: EPIC_PLATFORM.name,
  [XBOX_PLATFORM.type]: XBOX_PLATFORM.name,
};
