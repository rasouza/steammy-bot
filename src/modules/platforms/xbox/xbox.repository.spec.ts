import { xboxPendingCriteria } from './xbox.repository.js';

describe('xboxPendingCriteria', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  it('loads un-announced games', () => {
    const criteria = xboxPendingCriteria(now) as Record<string, unknown>;

    expect(criteria.broadcasted).toBe(false);
  });

  it('never loads already-announced games', () => {
    const criteria = xboxPendingCriteria(now) as Record<string, unknown>;
    const row = { broadcasted: true };

    const pending = Object.entries(criteria).every(
      ([column, expected]) => row[column as keyof typeof row] === expected,
    );

    expect(pending).toBe(false);
  });

  it('never consults an offer window (FR-008)', () => {
    expect(Object.keys(xboxPendingCriteria(now))).toEqual(['broadcasted']);
  });
});
