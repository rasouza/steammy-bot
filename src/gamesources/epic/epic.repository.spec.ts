import { FindOperator, Not } from 'typeorm';
import { EpicRepository, epicPendingCriteria } from './epic.repository.js';
import type { EpicGame } from './epic.types.js';

type EpicRepoArg = ConstructorParameters<typeof EpicRepository>[0];

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

/**
 * The five dev-reset primitives (contracts §3). A fake TypeORM `Repository`
 * records every call, so each assertion pins *what the repository asked the
 * driver to do* rather than what a database happened to return — no database,
 * no Nest testing module (Principle V).
 */
describe('EpicRepository dev primitives', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  function epicGame(id: string): EpicGame {
    return {
      id,
      title: `Game ${id}`,
      description: 'A free game.',
      offer_start_at: new Date('2026-09-29T00:00:00Z'),
      offer_end_at: new Date('2026-09-30T00:00:00Z'),
    };
  }

  function harness() {
    const find = vi.fn<(options: unknown) => Promise<unknown[]>>();
    const update =
      vi.fn<
        (criteria: unknown, partial: unknown) => Promise<{ affected?: number }>
      >();
    const updateAll =
      vi.fn<(partial: unknown) => Promise<{ affected?: number }>>();
    const deleteAll = vi.fn<() => Promise<unknown>>();

    find.mockResolvedValue([]);
    update.mockResolvedValue({ affected: 0 });
    updateAll.mockResolvedValue({ affected: 0 });
    deleteAll.mockResolvedValue({ affected: 0 });

    const repository = new EpicRepository({
      find,
      update,
      updateAll,
      deleteAll,
    } as unknown as EpicRepoArg);

    return { repository, find, update, updateAll, deleteAll };
  }

  describe('findDevCandidate', () => {
    it('orders by ascending primary key and takes exactly one row (R6)', async () => {
      const { repository, find } = harness();

      await repository.findDevCandidate(now);

      const options = find.mock.calls[0][0] as {
        order: Record<string, unknown>;
        take: number;
      };
      expect(options.order).toEqual({ id: 'ASC' });
      expect(options.take).toBe(1);
    });

    it('returns null when nothing qualifies', async () => {
      const { repository, find } = harness();
      find.mockResolvedValue([]);

      await expect(repository.findDevCandidate(now)).resolves.toBeNull();
    });

    it('uses the platform eligibility with `broadcasted` ignored (R-3.1)', async () => {
      const { repository, find } = harness();

      await repository.findDevCandidate(now);

      const { broadcasted: _announced, ...eligibility } =
        epicPendingCriteria(now);
      const options = find.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };

      expect(options.where).toEqual(eligibility);
      expect(options.where).not.toHaveProperty('broadcasted');
    });
  });

  describe('markBroadcastedExcept', () => {
    it('suppresses the pending rows and returns how many it marked', async () => {
      const { repository, update } = harness();
      update.mockResolvedValue({ affected: 4 });

      const suppressed = await repository.markBroadcastedExcept(
        epicGame('keep'),
        now,
      );

      expect(suppressed).toBe(4);
    });

    it('excludes the candidate from the suppressed set', async () => {
      const { repository, update } = harness();

      await repository.markBroadcastedExcept(epicGame('keep'), now);

      const criteria = update.mock.calls[0][0] as Record<string, unknown>;
      expect(criteria.id).toEqual(Not('keep'));
      expect(update.mock.calls[0][1]).toEqual({ broadcasted: true });
    });

    it('marks rows matching the platform pending criteria (R-3.1)', async () => {
      const { repository, update } = harness();

      await repository.markBroadcastedExcept(epicGame('keep'), now);

      const criteria = update.mock.calls[0][0] as Record<string, unknown>;
      const { id, ...pending } = criteria;
      expect(pending).toEqual(epicPendingCriteria(now));
      expect(criteria.broadcasted).toBe(false);
      expect(id).toBeDefined();
    });

    it('treats a driver that reports no affected count as zero', async () => {
      const { repository, update } = harness();
      update.mockResolvedValue({});

      await expect(
        repository.markBroadcastedExcept(epicGame('keep'), now),
      ).resolves.toBe(0);
    });
  });

  describe('markPending', () => {
    it('flips exactly one row back to pending', async () => {
      const { repository, update } = harness();

      await repository.markPending(epicGame('flip'));

      expect(update).toHaveBeenCalledWith(
        { id: 'flip' },
        { broadcasted: false },
      );
    });
  });

  describe('clear', () => {
    it('deletes every row without any eligibility or `now` (R-3.3)', async () => {
      const { repository, deleteAll } = harness();

      await repository.clear();

      expect(deleteAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('markAllBroadcasted', () => {
    it('marks the whole catalog and returns the affected count', async () => {
      const { repository, updateAll } = harness();
      updateAll.mockResolvedValue({ affected: 7 });

      await expect(repository.markAllBroadcasted()).resolves.toBe(7);
      expect(updateAll).toHaveBeenCalledWith({ broadcasted: true });
    });

    it('treats a driver that reports no affected count as zero', async () => {
      const { repository, updateAll } = harness();
      updateAll.mockResolvedValue({});

      await expect(repository.markAllBroadcasted()).resolves.toBe(0);
    });
  });
});
