import { Logger } from '@nestjs/common';
import { ChannelType } from 'discord.js';
import type { Client } from 'discord.js';
import type { Repository } from 'typeorm';
import type { Guild, Subscription } from '../../database/entities/index.js';
import { GamePlatform, type GamePlatformType } from '../../shared/constants.js';
import type { Game } from '../../shared/types/index.js';
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

function buildHarness(subscriptions: Subscription[]) {
  const channels = new Map<string, FakeChannel>();
  const fetch = vi.fn<(id: string) => Promise<FakeChannel>>(async (id) => {
    const channel = channels.get(id);
    if (!channel) {
      throw new Error('Unknown Channel');
    }
    return channel;
  });

  const subscriptionRepository = {
    find: vi
      .fn<(...args: unknown[]) => Promise<Subscription[]>>()
      .mockResolvedValue(subscriptions),
  };

  const service = new BroadcastService(
    { channels: { fetch } } as unknown as Client,
    subscriptionRepository as unknown as Repository<Subscription>,
    new GameEmbedService(),
  );

  return { service, fetch, channels };
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
      subscriptionRow('left-guild-channel', GamePlatform.XBOX, 'guild-1', true),
      subscriptionRow(
        'live-guild-channel',
        GamePlatform.XBOX,
        'guild-2',
        false,
      ),
    ]);
    channels.set('live-guild-channel', textChannel('deals'));

    const outcome = await service.send(XBOX_MESSAGE, game, GamePlatform.XBOX);

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
      subscriptionRow('live-channel', GamePlatform.XBOX, 'guild-2', false),
    ]);
    const channel = textChannel('deals');
    channels.set('live-channel', channel);

    const outcome = await service.send(XBOX_MESSAGE, game, GamePlatform.XBOX);

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
      subscriptionRow('dead-channel', GamePlatform.XBOX, 'guild-3', false),
    ]);

    const outcome = await service.send(XBOX_MESSAGE, game, GamePlatform.XBOX);

    expect(logs.warn).toContain(
      'Could not send broadcast to channel dead-channel: Unknown Channel',
    );
    expect(logs.debug).toEqual([]);
    expect(logs.error).toEqual([]);
    expect(outcome).toEqual({ delivered: 0, subscribers: 1 });
  });

  it('counts partial delivery without throwing (A-004)', async () => {
    const { service, channels } = buildHarness([
      subscriptionRow('good-channel', GamePlatform.XBOX, 'guild-1', false),
      subscriptionRow('broken-channel', GamePlatform.XBOX, 'guild-2', false),
    ]);
    channels.set('good-channel', textChannel('deals'));

    const outcome = await service.send(XBOX_MESSAGE, game, GamePlatform.XBOX);

    expect(outcome).toEqual({ delivered: 1, subscribers: 2 });
    expect(logs.warn).toContain(
      'Could not send broadcast to channel broken-channel: Unknown Channel',
    );
  });

  it('reports total failure when no channel accepts the message', async () => {
    const { service } = buildHarness([
      subscriptionRow('dead-1', GamePlatform.XBOX, 'guild-1', false),
      subscriptionRow('dead-2', GamePlatform.XBOX, 'guild-2', false),
    ]);

    const outcome = await service.send(XBOX_MESSAGE, game, GamePlatform.XBOX);

    expect(outcome).toEqual({ delivered: 0, subscribers: 2 });
    expect(logs.warn).toHaveLength(2);
  });

  it('reports zero subscribers when nobody targets the platform', async () => {
    const { service, fetch } = buildHarness([]);

    const outcome = await service.send(XBOX_MESSAGE, game, GamePlatform.XBOX);

    expect(outcome).toEqual({ delivered: 0, subscribers: 0 });
    expect(fetch).not.toHaveBeenCalled();
  });
});
