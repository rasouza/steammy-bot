import { GamePlatform, GamePlatformName } from './platform.constants.js';
import { EPIC_PLATFORM, XBOX_PLATFORM } from './platform.registry.js';

/**
 * Message lock (spec SC-002 / FR-015): moving announcement text from the
 * broadcast methods into registry configuration must not change a byte of
 * what subscribers see.
 */
describe('platform registry', () => {
  it("keeps Epic's announcement message byte-identical", () => {
    expect(EPIC_PLATFORM.type).toBe(GamePlatform.EPIC);
    expect(EPIC_PLATFORM.message).toBe(
      'New free game available on **Epic Games**',
    );
  });

  it("keeps Xbox's announcement message byte-identical", () => {
    expect(XBOX_PLATFORM.type).toBe(GamePlatform.XBOX);
    expect(XBOX_PLATFORM.message).toBe(
      'New game available on **Xbox Game Pass**',
    );
  });

  it('keeps the display names used by command replies and logs', () => {
    expect(GamePlatformName[GamePlatform.EPIC]).toBe('Epic Games');
    expect(GamePlatformName[GamePlatform.XBOX]).toBe('Xbox Game Pass');
  });
});
