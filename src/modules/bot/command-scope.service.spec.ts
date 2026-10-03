import { selectCommandScope } from './command-scope.service.js';

/**
 * The registration decision, split from the effect (research R10): this is a
 * pure function of two strings, unit-tested directly with no Nest testing
 * module and no Discord token (Principle V). The *effect* — that the real
 * hook lands on an already-populated registry — is asserted in
 * `test/command-scope.e2e-spec.ts`, because a regression there fails **open**.
 *
 * Covers contracts §1 (G1–G3) and §2 for the 3 roots × 3 env states.
 */
describe('selectCommandScope', () => {
  const guild = '111111111111111111';
  const roots = ['sync', 'broadcast', 'dev'] as const;

  /** G1/G2: with no test guild the three roots are removed, never global. */
  it('removes every root when no test guild is configured', () => {
    for (const root of roots) {
      expect(selectCommandScope(root, undefined, 'development')).toEqual({
        kind: 'removed',
      });
      expect(selectCommandScope(root, '', 'production')).toEqual({
        kind: 'removed',
      });
    }
  });

  /** Development run: all four commands are reachable in the test guild. */
  it('pins every root to the test guild in a development run', () => {
    for (const root of roots) {
      expect(selectCommandScope(root, guild, 'development')).toEqual({
        kind: 'guild',
        guilds: [guild],
      });
    }
  });

  /** G1: the admin pair is guild-scoped in every run mode (FR-013). */
  it('pins sync and broadcast to the test guild in a deployed run', () => {
    for (const root of ['sync', 'broadcast'] as const) {
      expect(selectCommandScope(root, guild, 'production')).toEqual({
        kind: 'guild',
        guilds: [guild],
      });
    }
  });

  /** G3: the dev pair never ships, even with the guild configured. */
  it('removes dev from a deployed run even when the guild is configured', () => {
    expect(selectCommandScope('dev', guild, 'production')).toEqual({
      kind: 'removed',
    });
    expect(selectCommandScope('dev', guild, 'staging')).toEqual({
      kind: 'removed',
    });
  });

  /** An absent `NODE_ENV` must never widen anything (contracts §2). */
  it('never treats an undefined NODE_ENV as development', () => {
    for (const root of roots) {
      const scope = selectCommandScope(root, guild, undefined);
      expect(scope).toEqual(
        root === 'dev'
          ? { kind: 'removed' }
          : { kind: 'guild', guilds: [guild] },
      );
    }
  });

  /** G1: a scoped command is never global — guilds is exactly one entry. */
  it('scopes to exactly one guild, never to a global registration', () => {
    for (const root of roots) {
      expect(selectCommandScope(root, guild, 'development')).toEqual({
        kind: 'guild',
        guilds: [guild],
      });
    }
  });
});
