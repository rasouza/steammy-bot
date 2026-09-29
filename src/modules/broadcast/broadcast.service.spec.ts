import { Logger } from '@nestjs/common';
import { ChannelType } from 'discord.js';
import type { Client } from 'discord.js';
import type { Repository } from 'typeorm';
import type {
  CatalogEpic,
  CatalogXbox,
  Guild,
  Subscription,
} from '../../database/entities/index.js';
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
  platform: string,
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

function buildHarness(subscriptions: Subscription[], game: Game) {
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
  const xboxRepository = {
    find: vi
      .fn<(...args: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValue([{ ...game, broadcasted: false }]),
    save: vi.fn<(entity: unknown) => Promise<unknown>>(
      async (entity) => entity,
    ),
  };
  const epicRepository = {
    find: vi
      .fn<(...args: unknown[]) => Promise<unknown[]>>()
      .mockResolvedValue([]),
    save: vi.fn<(entity: unknown) => Promise<unknown>>(
      async (entity) => entity,
    ),
  };

  const service = new BroadcastService(
    { channels: { fetch } } as unknown as Client,
    epicRepository as unknown as Repository<CatalogEpic>,
    xboxRepository as unknown as Repository<CatalogXbox>,
    subscriptionRepository as unknown as Repository<Subscription>,
    new GameEmbedService(),
  );

  return { service, fetch, channels };
}

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
    const { service, fetch, channels } = buildHarness(
      [
        subscriptionRow('left-guild-channel', 'xbox', 'guild-1', true),
        subscriptionRow('live-guild-channel', 'xbox', 'guild-2', false),
      ],
      game,
    );
    channels.set('live-guild-channel', textChannel('deals'));

    await service.broadcastXbox();

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('live-guild-channel');
    expect(fetch).not.toHaveBeenCalledWith('left-guild-channel');
    expect(logs.warn).toEqual([]);
    expect(logs.debug.join('\n')).toContain('left-guild-channel');
  });

  it('sends the broadcast to channels of guilds that are still served', async () => {
    const { service, channels } = buildHarness(
      [subscriptionRow('live-channel', 'xbox', 'guild-2', false)],
      game,
    );
    const channel = textChannel('deals');
    channels.set('live-channel', channel);

    await service.broadcastXbox();

    expect(channel.send).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledWith({
      content: 'New game available on **Xbox Game Pass**',
      embeds: [expect.anything()],
    });
    expect(logs.warn).toEqual([]);
  });

  it('still warns when a live guild channel cannot be fetched', async () => {
    const { service } = buildHarness(
      [subscriptionRow('dead-channel', 'xbox', 'guild-3', false)],
      game,
    );

    await service.broadcastXbox();

    expect(logs.warn).toContain(
      'Could not send broadcast to channel dead-channel: Unknown Channel',
    );
    expect(logs.debug).toEqual([]);
    expect(logs.error).toEqual([]);
  });
});
