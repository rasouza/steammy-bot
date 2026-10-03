import { Not } from 'typeorm';
import { XboxRepository, xboxPendingCriteria } from './xbox.repository.js';
import type { Game } from '../../modules/platforms/platform.types.js';

type XboxRepoArg = ConstructorParameters<typeof XboxRepository>[0];

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

/**
 * The five dev-reset primitives (contracts §3) against Xbox's rules: its only
 * eligibility condition is `broadcasted`, so the dev candidate is any row in
 * the catalog. Same fake-repository technique as the Epic spec — no database,
 * no Nest testing module (Principle V).
 */
describe('XboxRepository dev primitives', () => {
  const now = new Date('2026-09-29T12:00:00Z');

  function game(id: string): Game {
    return { id, title: `Game ${id}`, description: 'A free game.' };
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

    const repository = new XboxRepository({
      find,
      update,
      updateAll,
      deleteAll,
    } as unknown as XboxRepoArg);

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

    it('ignores `broadcasted`, leaving no other Xbox condition (R-3.1)', async () => {
      const { repository, find } = harness();

      await repository.findDevCandidate(now);

      const options = find.mock.calls[0][0] as {
        where: Record<string, unknown>;
      };
      expect(options.where).toEqual({});
    });
  });

  describe('markBroadcastedExcept', () => {
    it('suppresses the pending rows and returns how many it marked', async () => {
      const { repository, update } = harness();
      update.mockResolvedValue({ affected: 2 });

      await expect(
        repository.markBroadcastedExcept(game('keep'), now),
      ).resolves.toBe(2);
    });

    it('excludes the candidate from the suppressed set', async () => {
      const { repository, update } = harness();

      await repository.markBroadcastedExcept(game('keep'), now);

      const criteria = update.mock.calls[0][0] as Record<string, unknown>;
      expect(criteria).toEqual({
        ...xboxPendingCriteria(now),
        id: Not('keep'),
      });
      expect(update.mock.calls[0][1]).toEqual({ broadcasted: true });
    });
  });

  describe('markPending', () => {
    it('flips exactly one row back to pending', async () => {
      const { repository, update } = harness();

      await repository.markPending(game('flip'));

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
      updateAll.mockResolvedValue({ affected: 5 });

      await expect(repository.markAllBroadcasted()).resolves.toBe(5);
      expect(updateAll).toHaveBeenCalledWith({ broadcasted: true });
    });
  });
});
