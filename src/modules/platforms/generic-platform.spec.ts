import { Logger } from '@nestjs/common';
import type { GamePlatformType } from '../../gamesources/index.js';
import type { Game } from './platform.types.js';
import { GenericPlatform } from './generic-platform.js';
import type { PlatformDefinition, SendOutcome } from './platform.types.js';

interface FakeSource {
  id: string;
}

const definition = {
  type: 'epic',
  message: 'New free game available on **Epic Games**',
} as PlatformDefinition<FakeSource, Game>;

function game(id: string): Game {
  return { id, title: `Game ${id}`, description: 'A free game.' };
}

function buildHarness() {
  const sources: FakeSource[] = [{ id: 'a' }, { id: 'b' }];
  const api = {
    fetch: vi.fn<() => Promise<FakeSource[]>>().mockResolvedValue(sources),
  };
  const mapper = {
    toGame: vi.fn<(source: FakeSource) => Game | null>(),
  };
  const repository = {
    saveAll: vi.fn<(games: Game[]) => Promise<void>>(),
    findPending: vi.fn<(now: Date) => Promise<Game[]>>(),
    markBroadcasted: vi.fn<(game: Game) => Promise<void>>(),
    findDevCandidate: vi.fn<(now: Date) => Promise<Game | null>>(),
    markBroadcastedExcept:
      vi.fn<(candidate: Game, now: Date) => Promise<number>>(),
    markPending: vi.fn<(game: Game) => Promise<void>>(),
    clear: vi.fn<() => Promise<void>>(),
    markAllBroadcasted: vi.fn<() => Promise<number>>(),
  };
  const broadcast = {
    send: vi.fn<
      (
        message: string,
        game: Game,
        platform: GamePlatformType,
        recipient?: string,
      ) => Promise<SendOutcome>
    >(),
  };
  repository.saveAll.mockResolvedValue(undefined);
  repository.findPending.mockResolvedValue([]);
  repository.markBroadcasted.mockResolvedValue(undefined);
  repository.findDevCandidate.mockResolvedValue(null);
  repository.markBroadcastedExcept.mockResolvedValue(0);
  repository.markPending.mockResolvedValue(undefined);
  repository.clear.mockResolvedValue(undefined);
  repository.markAllBroadcasted.mockResolvedValue(0);
  broadcast.send.mockResolvedValue({ delivered: 1, subscribers: 1 });

  const platform = new GenericPlatform(
    definition,
    api,
    mapper,
    repository,
    broadcast,
  );

  return { platform, api, mapper, repository, broadcast };
}

describe('GenericPlatform', () => {
  let logs: { log: string[]; warn: string[]; error: string[] };

  beforeEach(() => {
    logs = { log: [], warn: [], error: [] };
    vi.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => {
      logs.log.push(String(m));
    });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => {
      logs.warn.push(String(m));
    });
    vi.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => {
      logs.error.push(String(m));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sync', () => {
    it('fetches sources, maps each one, and persists the mapped games', async () => {
      const { platform, api, mapper, repository } = buildHarness();
      const mapped = [game('a'), game('b')];
      mapper.toGame
        .mockReturnValueOnce(mapped[0])
        .mockReturnValueOnce(mapped[1]);

      await platform.sync();

      expect(api.fetch).toHaveBeenCalledTimes(1);
      expect(mapper.toGame).toHaveBeenCalledTimes(2);
      expect(mapper.toGame).toHaveBeenNthCalledWith(1, { id: 'a' });
      expect(mapper.toGame).toHaveBeenNthCalledWith(2, { id: 'b' });
      expect(repository.saveAll).toHaveBeenCalledWith(mapped);
    });

    it('drops sources the mapper reports as non-qualifying (null)', async () => {
      const { platform, mapper, repository } = buildHarness();
      const kept = game('a');
      mapper.toGame.mockReturnValueOnce(kept).mockReturnValueOnce(null);

      await platform.sync();

      expect(repository.saveAll).toHaveBeenCalledWith([kept]);
    });
  });

  describe('broadcastPending', () => {
    it('sends the definition message, then marks, and returns the count', async () => {
      const { platform, repository, broadcast } = buildHarness();
      const pending = [game('x')];
      repository.findPending.mockResolvedValue(pending);

      const announced = await platform.broadcastPending();

      expect(broadcast.send).toHaveBeenCalledWith(
        definition.message,
        pending[0],
        'epic',
      );
      expect(repository.markBroadcasted).toHaveBeenCalledWith(pending[0]);
      expect(broadcast.send.mock.invocationCallOrder[0]).toBeLessThan(
        repository.markBroadcasted.mock.invocationCallOrder[0],
      );
      expect(announced).toBe(1);
    });

    it('does not mark a game when send throws (FR-009)', async () => {
      const { platform, repository, broadcast } = buildHarness();
      repository.findPending.mockResolvedValue([game('x')]);
      broadcast.send.mockRejectedValue(new Error('discord is down'));

      const announced = await platform.broadcastPending();

      expect(repository.markBroadcasted).not.toHaveBeenCalled();
      expect(announced).toBe(0);
      expect(logs.error.join('\n')).toContain('discord is down');
    });

    it('keeps delivering the remaining games after one failure', async () => {
      const { platform, repository, broadcast } = buildHarness();
      const [broken, healthy] = [game('broken'), game('healthy')];
      repository.findPending.mockResolvedValue([broken, healthy]);
      broadcast.send
        .mockRejectedValueOnce(new Error('channel gone'))
        .mockResolvedValueOnce({ delivered: 1, subscribers: 1 });

      const announced = await platform.broadcastPending();

      expect(repository.markBroadcasted).not.toHaveBeenCalledWith(broken);
      expect(repository.markBroadcasted).toHaveBeenCalledWith(healthy);
      expect(announced).toBe(1);
    });

    it('sends nothing and returns 0 for an empty queue', async () => {
      const { platform, repository, broadcast } = buildHarness();
      repository.findPending.mockResolvedValue([]);

      const announced = await platform.broadcastPending();

      expect(broadcast.send).not.toHaveBeenCalled();
      expect(repository.markBroadcasted).not.toHaveBeenCalled();
      expect(announced).toBe(0);
    });

    it('leaves the game pending when every delivery fails (FR-010)', async () => {
      const { platform, repository, broadcast } = buildHarness();
      const pending = [game('x')];
      repository.findPending.mockResolvedValue(pending);
      broadcast.send.mockResolvedValue({ delivered: 0, subscribers: 3 });

      const announced = await platform.broadcastPending();

      expect(repository.markBroadcasted).not.toHaveBeenCalled();
      expect(announced).toBe(0);
      expect(logs.warn.join('\n')).toContain('Game x');
    });

    it('announces a retried game exactly once after delivery recovers', async () => {
      const { platform, repository, broadcast } = buildHarness();
      const pending = [game('x')];
      repository.findPending.mockResolvedValue(pending);
      broadcast.send.mockResolvedValueOnce({ delivered: 0, subscribers: 2 });

      expect(await platform.broadcastPending()).toBe(0);
      expect(repository.markBroadcasted).not.toHaveBeenCalled();

      // Delivery recovered; the next pass finds the game still pending.
      broadcast.send.mockResolvedValueOnce({ delivered: 2, subscribers: 2 });

      expect(await platform.broadcastPending()).toBe(1);
      expect(repository.markBroadcasted).toHaveBeenCalledTimes(1);
      expect(repository.markBroadcasted).toHaveBeenCalledWith(pending[0]);
    });

    it('marks when at least one channel received the game (A-004)', async () => {
      const { platform, repository, broadcast } = buildHarness();
      repository.findPending.mockResolvedValue([game('x')]);
      broadcast.send.mockResolvedValue({ delivered: 1, subscribers: 4 });

      const announced = await platform.broadcastPending();

      expect(repository.markBroadcasted).toHaveBeenCalledTimes(1);
      expect(announced).toBe(1);
    });

    it('marks when nobody subscribes so the queue stays bounded (A-005)', async () => {
      const { platform, repository, broadcast } = buildHarness();
      repository.findPending.mockResolvedValue([game('x')]);
      broadcast.send.mockResolvedValue({ delivered: 0, subscribers: 0 });

      const announced = await platform.broadcastPending();

      expect(repository.markBroadcasted).toHaveBeenCalledTimes(1);
      expect(announced).toBe(1);
    });
  });

  /**
   * `/dev broadcast` — research R6's four steps, contracts §4 / R-4.2.
   *
   * The sequence is the contract: pick, suppress the surplus, flip the pick
   * back to pending, then run the *normal* loop so exactly one row is
   * eligible. Nothing here introduces a second sender — the last step is the
   * same `send` every other path uses, now addressed to `recipient`.
   */
  describe('devBroadcast', () => {
    const RECIP = 'invocation-channel';

    it('picks, suppresses, flips to pending, then sends exactly once (R6)', async () => {
      const { platform, repository, broadcast } = buildHarness();
      const candidate = game('pick');
      repository.findDevCandidate.mockResolvedValue(candidate);
      repository.markBroadcastedExcept.mockResolvedValue(4);
      repository.findPending.mockResolvedValue([candidate]);

      const result = await platform.devBroadcast(RECIP);

      expect(result).toEqual({
        delivered: 1,
        suppressed: 4,
        skipped: false,
      });
      expect(repository.markBroadcastedExcept).toHaveBeenCalledWith(
        candidate,
        expect.any(Date),
      );
      // The flip is unconditional — it is what makes a fully-announced
      // catalog deliverable again (SC-002's "never zero-and-stuck").
      expect(repository.markPending).toHaveBeenCalledWith(candidate);
      expect(broadcast.send).toHaveBeenCalledTimes(1);
      expect(broadcast.send).toHaveBeenCalledWith(
        definition.message,
        candidate,
        'epic',
        RECIP,
      );
    });

    it('runs the four steps in order', async () => {
      const { platform, repository, broadcast } = buildHarness();
      const candidate = game('pick');
      repository.findDevCandidate.mockResolvedValue(candidate);
      repository.findPending.mockResolvedValue([candidate]);

      await platform.devBroadcast(RECIP);

      const at = (mock: { mock: { invocationCallOrder: number[] } }) =>
        mock.mock.invocationCallOrder[0];

      expect(at(repository.findDevCandidate)).toBeLessThan(
        at(repository.markBroadcastedExcept),
      );
      expect(at(repository.markBroadcastedExcept)).toBeLessThan(
        at(repository.markPending),
      );
      expect(at(repository.markPending)).toBeLessThan(at(broadcast.send));
    });

    it('reports the suppression count the repository returned', async () => {
      const { platform, repository } = buildHarness();
      repository.findDevCandidate.mockResolvedValue(game('pick'));
      repository.markBroadcastedExcept.mockResolvedValue(7);

      const result = await platform.devBroadcast(RECIP);

      // FR-015 obliges the reply to state this number — it must not be
      // recomputed or dropped on the way out.
      expect(result.suppressed).toBe(7);
    });

    it('skips a platform with no eligible row and sends nothing (FR-007)', async () => {
      const { platform, repository, broadcast } = buildHarness();
      repository.findDevCandidate.mockResolvedValue(null);

      const result = await platform.devBroadcast(RECIP);

      expect(result).toEqual({
        delivered: 0,
        suppressed: 0,
        skipped: true,
      });
      expect(repository.markBroadcastedExcept).not.toHaveBeenCalled();
      expect(repository.markPending).not.toHaveBeenCalled();
      expect(broadcast.send).not.toHaveBeenCalled();
    });

    it('leaves the candidate pending when the delivery fails (Principle II)', async () => {
      const { platform, repository, broadcast } = buildHarness();
      const candidate = game('pick');
      repository.findDevCandidate.mockResolvedValue(candidate);
      repository.markBroadcastedExcept.mockResolvedValue(3);
      // One recipient that never accepts the message: the loop must not
      // mark, because `subscribers` is 1 and `delivered` is 0.
      repository.findPending.mockResolvedValue([candidate]);
      broadcast.send.mockResolvedValue({ delivered: 0, subscribers: 1 });

      const result = await platform.devBroadcast(RECIP);

      expect(result).toEqual({
        delivered: 0,
        suppressed: 3,
        skipped: false,
      });
      expect(repository.markBroadcasted).not.toHaveBeenCalled();
      // The flip already ran, so the row is pending again and a later
      // `/dev broadcast` can retry it.
      expect(repository.markPending).toHaveBeenCalledWith(candidate);
    });

    it('never passes a recipient from the scheduled pass (R-4.2)', async () => {
      const { platform, repository, broadcast } = buildHarness();
      repository.findPending.mockResolvedValue([game('x')]);

      await platform.broadcastPending();

      const [message, , type, recipient] = broadcast.send.mock.calls[0];
      expect([message, type]).toEqual([definition.message, 'epic']);
      // R-4.2: `devBroadcast` is the only caller that supplies a recipient.
      // The scheduled pass forwards the slot with nothing in it, so a real
      // channel id here would mean the schedule had been redirected.
      expect(recipient).toBeUndefined();
    });
  });

  /**
   * `/dev sync` — research R5, contracts §4 rule R-4.4.
   *
   * The ordering is the whole feature: a storefront outage must never empty a
   * catalog (US3 scenario 3 / SC-005), which is why `fetch` has to resolve
   * before the first write.
   */
  describe('reset', () => {
    it('performs no write when the storefront fetch rejects (R-4.4)', async () => {
      const { platform, api, mapper, repository } = buildHarness();
      api.fetch.mockRejectedValue(new Error('storefront is down'));
      repository.markAllBroadcasted.mockResolvedValue(3);

      await expect(platform.reset()).rejects.toThrow('storefront is down');

      // The point of R-4.4: a failed fetch leaves the catalog byte-identical.
      expect(repository.clear).not.toHaveBeenCalled();
      expect(repository.saveAll).not.toHaveBeenCalled();
      expect(repository.markAllBroadcasted).not.toHaveBeenCalled();
      expect(mapper.toGame).not.toHaveBeenCalled();
    });

    it('still clears when a successful fetch returns zero rows', async () => {
      const { platform, api, repository } = buildHarness();
      api.fetch.mockResolvedValue([]);

      const result = await platform.reset();

      // A successful empty response means the catalog really is empty —
      // only a *failed* fetch preserves the old rows (R5).
      expect(repository.clear).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ fetched: 0, seeded: 0 });
    });

    it('reports what the storefront returned and what was seeded announced', async () => {
      const { platform, mapper, repository } = buildHarness();
      mapper.toGame.mockReturnValueOnce(game('a')).mockReturnValueOnce(null);
      repository.markAllBroadcasted.mockResolvedValue(1);

      const result = await platform.reset();

      // `fetched` is the raw storefront response (2), `seeded` the rows that
      // ended up written and marked announced (1) — the count FR-015 obliges
      // the reply to state.
      expect(result).toEqual({ fetched: 2, seeded: 1 });
    });

    it('clears before it writes, then marks announced', async () => {
      const { platform, mapper, repository } = buildHarness();
      mapper.toGame.mockImplementation((source: FakeSource) => game(source.id));

      await platform.reset();

      expect(repository.clear.mock.invocationCallOrder[0]).toBeLessThan(
        repository.saveAll.mock.invocationCallOrder[0],
      );
      expect(repository.saveAll.mock.invocationCallOrder[0]).toBeLessThan(
        repository.markAllBroadcasted.mock.invocationCallOrder[0],
      );
      expect(repository.saveAll).toHaveBeenCalledWith([game('a'), game('b')]);
    });

    it('never touches broadcast delivery', async () => {
      const { platform, broadcast } = buildHarness();

      await platform.reset();

      expect(broadcast.send).not.toHaveBeenCalled();
    });
  });
});
