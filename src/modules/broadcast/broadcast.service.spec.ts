import { Logger } from '@nestjs/common';
import { ChannelType } from 'discord.js';
import type { Client } from 'discord.js';
import type { Repository } from 'typeorm';
import type { Guild, Subscription } from '../../database/entities/index.js';
import type { GamePlatformType } from '../../gamesources/index.js';
import type { Game } from '../platforms/platform.types.js';
import { BroadcastService } from './broadcast.service.js';
import { GameEmbedService } from './game-embed.service.js';

interface FakeChannel {
  type: ChannelType;
  name: string;
  guild: { name: string };
  send: ReturnType<typeof vi.fn>;
}

function textChannel(name: string): FakeChannel {
  return {
    type: ChannelType.GuildText,
    name,
    guild: { name: 'Test Guild' },
    send: vi
      .fn<(content: unknown) => Promise<void>>()
      .mockResolvedValue(undefined),
  };
}

function subscriptionRow(
  id: string,
  platform: GamePlatformType,
  guildId: string,
  guildDeleted: boolean,
): Subscription {
  return {
    id,
    platform,
    guildId,
    guild: { id: guildId, deleted: guildDeleted } as Guild,
  } as Subscription;
}

interface HarnessOptions {
  /**
   * Contracts §4 / R-4.1: when a `recipient` is given the subscription table
   * must not be touched at all. Making the stub reject turns that from a
   * "should not have been called" assertion into a loud failure on the
   * query itself, so the recipient path cannot quietly fall back to it.
   */
  forbidSubscriptionQuery?: boolean;
}

function buildHarness(
  subscriptions: Subscription[],
  options: HarnessOptions = {},
) {
  const channels = new Map<string, FakeChannel>();
  const fetch = vi.fn<(id: string) => Promise<FakeChannel>>(async (id) => {
    const channel = channels.get(id);
    if (!channel) {
      throw new Error('Unknown Channel');
    }
    return channel;
  });

  const find = options.forbidSubscriptionQuery
    ? vi.fn<(...args: unknown[]) => Promise<Subscription[]>>((..._args) =>
        Promise.reject(
          new Error(
            'subscription repository was queried with an explicit recipient (R-4.1)',
          ),
        ),
      )
    : vi
        .fn<(...args: unknown[]) => Promise<Subscription[]>>()
        .mockResolvedValue(subscriptions);

  const subscriptionRepository = { find };

  const service = new BroadcastService(
    { channels: { fetch } } as unknown as Client,
    subscriptionRepository as unknown as Repository<Subscription>,
    new GameEmbedService(),
  );

  return { service, fetch, channels, subscriptionRepository };
}

const XBOX_MESSAGE = 'New game available on **Xbox Game Pass**';

describe('BroadcastService', () => {
  const game: Game = {
    id: 'game-1',
    title: 'Some Game',
    description: 'A free game.',
  };

  let logs: { log: string[]; warn: string[]; debug: string[]; error: string[] };

  beforeEach(() => {
    logs = { log: [], warn: [], debug: [], error: [] };
    vi.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => {
      logs.log.push(String(m));
    });
    vi.spyOn(Logger.prototype, 'warn').mockImplementation((m: unknown) => {
      logs.warn.push(String(m));
    });
    vi.spyOn(Logger.prototype, 'debug').mockImplementation((m: unknown) => {
      logs.debug.push(String(m));
    });
    vi.spyOn(Logger.prototype, 'error').mockImplementation((m: unknown) => {
      logs.error.push(String(m));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips subscriptions whose guild is soft-deleted', async () => {
    const { service, fetch, channels } = buildHarness([
      subscriptionRow('left-guild-channel', 'xbox', 'guild-1', true),
      subscriptionRow('live-guild-channel', 'xbox', 'guild-2', false),
    ]);
    channels.set('live-guild-channel', textChannel('deals'));

    const outcome = await service.send(XBOX_MESSAGE, game, 'xbox');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('live-guild-channel');
    expect(fetch).not.toHaveBeenCalledWith('left-guild-channel');
    expect(logs.warn).toEqual([]);
    expect(logs.debug.join('\n')).toContain('left-guild-channel');
    // Orphan rows still count as resolved subscribers (contracts §4).
    expect(outcome).toEqual({ delivered: 1, subscribers: 2 });
  });

  it('sends the broadcast to channels of guilds that are still served', async () => {
    const { service, channels } = buildHarness([
      subscriptionRow('live-channel', 'xbox', 'guild-2', false),
    ]);
    const channel = textChannel('deals');
    channels.set('live-channel', channel);

    const outcome = await service.send(XBOX_MESSAGE, game, 'xbox');

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledWith({
      content: XBOX_MESSAGE,
      embeds: [expect.anything()],
    });
    expect(logs.warn).toEqual([]);
    expect(outcome).toEqual({ delivered: 1, subscribers: 1 });
  });

  it('still warns when a live guild channel cannot be fetched', async () => {
    const { service } = buildHarness([
      subscriptionRow('dead-channel', 'xbox', 'guild-3', false),
    ]);

    const outcome = await service.send(XBOX_MESSAGE, game, 'xbox');

    expect(logs.warn).toContain(
      'Could not send broadcast to channel dead-channel: Unknown Channel',
    );
    expect(logs.debug).toEqual([]);
    expect(logs.error).toEqual([]);
    expect(outcome).toEqual({ delivered: 0, subscribers: 1 });
  });

  it('counts partial delivery without throwing (A-004)', async () => {
    const { service, channels } = buildHarness([
      subscriptionRow('good-channel', 'xbox', 'guild-1', false),
      subscriptionRow('broken-channel', 'xbox', 'guild-2', false),
    ]);
    channels.set('good-channel', textChannel('deals'));

    const outcome = await service.send(XBOX_MESSAGE, game, 'xbox');

    expect(outcome).toEqual({ delivered: 1, subscribers: 2 });
    expect(logs.warn).toContain(
      'Could not send broadcast to channel broken-channel: Unknown Channel',
    );
  });

  it('reports total failure when no channel accepts the message', async () => {
    const { service } = buildHarness([
      subscriptionRow('dead-1', 'xbox', 'guild-1', false),
      subscriptionRow('dead-2', 'xbox', 'guild-2', false),
    ]);

    const outcome = await service.send(XBOX_MESSAGE, game, 'xbox');

    expect(outcome).toEqual({ delivered: 0, subscribers: 2 });
    expect(logs.warn).toHaveLength(2);
  });

  it('reports zero subscribers when nobody targets the platform', async () => {
    const { service, fetch } = buildHarness([]);

    const outcome = await service.send(XBOX_MESSAGE, game, 'xbox');

    expect(outcome).toEqual({ delivered: 0, subscribers: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });

  /**
   * Contracts §4, R-4.1 / R-4.2 / R-4.3 — the `recipient` `/dev broadcast`
   * passes. The subscription repository is stubbed to *reject if queried*, so
   * R-4.1 fails on the query itself rather than only on a call assertion.
   */
  describe('with an explicit recipient (dev broadcast)', () => {
    it('fetches exactly that channel and never queries a subscription (R-4.1)', async () => {
      const { service, fetch, channels, subscriptionRepository } = buildHarness(
        [],
        { forbidSubscriptionQuery: true },
      );
      channels.set('invocation-channel', textChannel('dev-smoke'));

      const outcome = await service.send(
        XBOX_MESSAGE,
        game,
        'xbox',
        'invocation-channel',
      );

      expect(subscriptionRepository.find).not.toHaveBeenCalled();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith('invocation-channel');
      expect(logs.warn).toEqual([]);
      expect(outcome).toEqual({ delivered: 1, subscribers: 1 });
    });

    it('builds exactly one embed for the one delivery (R-4.1)', async () => {
      const build = vi.spyOn(GameEmbedService.prototype, 'build');
      const { service, channels } = buildHarness([], {
        forbidSubscriptionQuery: true,
      });
      channels.set('invocation-channel', textChannel('dev-smoke'));

      await service.send(XBOX_MESSAGE, game, 'xbox', 'invocation-channel');

      expect(build).toHaveBeenCalledTimes(1);
    });

    it('reports one recipient even when the delivery fails (R-4.3)', async () => {
      const { service, subscriptionRepository } = buildHarness([], {
        forbidSubscriptionQuery: true,
      });

      // The channel is never registered, so the fetch rejects and nothing is
      // delivered. `subscribers` must still be 1: `broadcastPending` marks on
      // `delivered > 0 || subscribers === 0`, so a 0 here would read as
      // "nobody to tell" and announce a game that Discord never saw —
      // exactly the pre-delivery marking Principle II forbids.
      const outcome = await service.send(
        XBOX_MESSAGE,
        game,
        'xbox',
        'missing-channel',
      );

      expect(outcome).toEqual({ delivered: 0, subscribers: 1 });
      expect(outcome.subscribers).not.toBe(0);
      expect(subscriptionRepository.find).not.toHaveBeenCalled();
    });

    it('reports one recipient when the channel is not a text channel', async () => {
      const { service, channels } = buildHarness([], {
        forbidSubscriptionQuery: true,
      });
      channels.set('voice-channel', {
        type: ChannelType.GuildVoice,
        name: 'dev-smoke',
        guild: { name: 'Test Guild' },
        send: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      });

      const outcome = await service.send(
        XBOX_MESSAGE,
        game,
        'xbox',
        'voice-channel',
      );

      expect(outcome).toEqual({ delivered: 0, subscribers: 1 });
    });

    it('keeps the no-recipient path querying subscriptions (R-4.2)', async () => {
      const { service, channels, subscriptionRepository } = buildHarness([
        subscriptionRow('live-channel', 'xbox', 'guild-2', false),
      ]);
      channels.set('live-channel', textChannel('deals'));

      const outcome = await service.send(XBOX_MESSAGE, game, 'xbox');

      expect(subscriptionRepository.find).toHaveBeenCalledWith({
        where: { platform: 'xbox' },
        relations: { guild: true },
      });
      expect(outcome).toEqual({ delivered: 1, subscribers: 1 });
    });
  });
});
