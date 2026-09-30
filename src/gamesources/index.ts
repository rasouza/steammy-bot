import { EPIC_PLATFORM } from './epic/index.js';
import { XBOX_PLATFORM } from './xbox/index.js';

/**
 * The central registration list — the one explicitly registered file a
 * platform-add edits outside its own subfolder (spec FR-003), and the only
 * bridge the machinery consumes (SC-003). Explicit registration, no filesystem
 * auto-discovery: type-safe and understandable in a small app (plan research
 * R2). The list is also the *authority*: the key union, the display-name map,
 * and the Discord choices all derive from it, so none of them can drift apart.
 */
export const gameSources = [EPIC_PLATFORM, XBOX_PLATFORM] as const;

/**
 * Domain keys — the union of the keys registered in `gameSources`, not a
 * separately maintained list. A folder missing from the list is simply not a
 * platform: it gets no key, no display name, and no Discord choice.
 */
export type GamePlatformType = (typeof gameSources)[number]['type'];

/**
 * Display names derived from the definitions — one entry per registration,
 * keyed by the same `type` the definition carries (plan research R1).
 */
export const gameSourceNames: Record<GamePlatformType, string> =
  Object.fromEntries(
    gameSources.map(
      (definition) => [definition.type, definition.name] as const,
    ),
  ) as Record<GamePlatformType, string>;
