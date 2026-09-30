import { EPIC_PLATFORM } from '../../gamesources/epic/index.js';
import { XBOX_PLATFORM } from '../../gamesources/xbox/index.js';
import { gameSourceNames, gameSources } from '../../gamesources/index.js';

/**
 * Message lock (spec SC-002 / FR-015): moving announcement text from the
 * broadcast methods into registry configuration must not change a byte of
 * what subscribers see.
 */
describe('platform registry', () => {
  it("keeps Epic's announcement message byte-identical", () => {
    expect(EPIC_PLATFORM.type).toBe('epic');
    expect(EPIC_PLATFORM.message).toBe(
      'New free game available on **Epic Games**',
    );
  });

  it("keeps Xbox's announcement message byte-identical", () => {
    expect(XBOX_PLATFORM.type).toBe('xbox');
    expect(XBOX_PLATFORM.message).toBe(
      'New game available on **Xbox Game Pass**',
    );
  });

  it('keeps the display names used by command replies and logs', () => {
    expect(gameSourceNames['epic']).toBe('Epic Games');
    expect(gameSourceNames['xbox']).toBe('Xbox Game Pass');
  });

  it('keeps every platform definition in the central list', () => {
    expect(gameSources).toContain(EPIC_PLATFORM);
    expect(gameSources).toContain(XBOX_PLATFORM);
  });
});
