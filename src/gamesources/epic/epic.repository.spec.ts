import { FindOperator } from 'typeorm';
import { epicPendingCriteria } from './epic.repository.js';

/**
 * Evaluates a TypeORM `where` clause the way the driver would, so the pure
 * criteria function can be pinned without a database (plan §15, FR-016).
 */
function matches(
  row: Record<string, unknown>,
  criteria: Record<string, unknown>,
): boolean {
  return Object.entries(criteria).every(([column, expected]) => {
    const value = row[column];

    if (expected instanceof FindOperator) {
      const operator = expected as unknown as {
        _type: string;
        _value: unknown;
      };
      if (operator._type === 'lessThanOrEqual') {
        return (value as Date).getTime() <= (operator._value as Date).getTime();
      }
      if (operator._type === 'moreThanOrEqual') {
        return (value as Date).getTime() >= (operator._value as Date).getTime();
      }
      throw new Error(`Unexpected operator in criteria: ${operator._type}`);
    }

    return value === expected;
  });
}

describe('epicPendingCriteria', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  const activeWindow = {
    offer_start_at: new Date('2026-09-29T00:00:00Z'),
    offer_end_at: new Date('2026-09-30T00:00:00Z'),
  };

  it('does not load offers that have not started yet', () => {
    const row = {
      broadcasted: false,
      offer_start_at: new Date('2026-09-29T13:00:00Z'),
      offer_end_at: new Date('2026-09-30T00:00:00Z'),
    };

    expect(matches(row, epicPendingCriteria(now))).toBe(false);
  });

  it('does not load expired offers', () => {
    const row = {
      broadcasted: false,
      offer_start_at: new Date('2026-09-27T00:00:00Z'),
      offer_end_at: new Date('2026-09-29T11:59:59Z'),
    };

    expect(matches(row, epicPendingCriteria(now))).toBe(false);
  });

  it('loads an active, un-announced offer', () => {
    const row = { broadcasted: false, ...activeWindow };

    expect(matches(row, epicPendingCriteria(now))).toBe(true);
  });

  it('never loads an already-announced offer', () => {
    const row = { broadcasted: true, ...activeWindow };

    expect(matches(row, epicPendingCriteria(now))).toBe(false);
  });
});
