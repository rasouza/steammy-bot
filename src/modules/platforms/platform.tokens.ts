/** Injection token for `PlatformRuntime[]` — every registered platform (contracts §3). */
export const PLATFORM_REGISTRY: unique symbol = Symbol('PLATFORM_REGISTRY');

/** Per-definition provider token, e.g. `platform:<key>`. */
export function platformToken(type: string): string {
  return `platform:${type}`;
}
