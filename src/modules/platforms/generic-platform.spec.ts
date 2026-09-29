import { Logger } from '@nestjs/common';
import { GamePlatform } from '../../shared/constants.js';
import type { GamePlatformType } from '../../shared/constants.js';
import type { Game } from '../../shared/types/index.js';
import { GenericPlatform } from './generic-platform.js';
import type { PlatformDefinition, SendOutcome } from './platform.types.js';

interface FakeSource {
  id: string;
}

const definition = {
  type: GamePlatform.EPIC,
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
  };
  const broadcast = {
    send: vi.fn<
      (
        message: string,
        game: Game,
        platform: GamePlatformType,
      ) => Promise<SendOutcome>
    >(),
  };
  repository.saveAll.mockResolvedValue(undefined);
  repository.findPending.mockResolvedValue([]);
  repository.markBroadcasted.mockResolvedValue(undefined);
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
        GamePlatform.EPIC,
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
});
