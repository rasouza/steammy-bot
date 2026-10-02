import type { INestApplication } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { CatalogEpic, CatalogXbox } from '../src/database/entities/index.js';
import { EPIC_PLATFORM } from '../src/gamesources/epic/index.js';
import { XBOX_PLATFORM } from '../src/gamesources/xbox/index.js';
import type { PlatformRuntime } from '../src/modules/platforms/platform.types.js';
import { catalogEpicFactory } from './factories/catalog-epic.factory.js';
import { catalogXboxFactory } from './factories/catalog-xbox.factory.js';
import { guildFactory } from './factories/guild.factory.js';
import { subscriptionFactory } from './factories/subscription.factory.js';
import { fakeTextChannel } from './fixtures/broadcast.fixture.js';
import { cleanTestDatabase } from './helpers/database.js';
import { createTestingApp, fetchSpy, sendSpy } from './helpers/testing-app.js';
import { createBroadcastScenario } from './scenarios/broadcast.scenario.js';

/**
 * Broadcast pipeline contract, end to end: real `GenericPlatform` and real
 * `BroadcastService` against real PostgreSQL (schema + migrations applied by
 * `DatabaseModule`), with exactly one mocked boundary — the Discord client
 * provided by the shared test module in place of Necord's. Nothing logs in,
 * nothing is posted.
 *
 * Coverage shape: focused tests per business behavior — pending vs
 * already-broadcast, fan-out, departed guilds, inactive channels, delivery
 * failure — each run for both platforms where the flow is generic, plus one
 * mixed-state regression seeding a realistic dataset in a single run. States
 * are composed from the Fishery factories through
 * `createBroadcastScenario`, so every test declares exactly the data it
 * asserts on. The departed-guild cases are the executable regression test
 * for the production `broadcast-stale-subscriptions` bug: a subscription
 * pointing at a guild the bot has left must be skipped before any channel
 * fetch, without preventing delivery to the active subscriber.
 */

type Catalog = 'epic' | 'xbox';

const catalogCases: { catalog: Catalog; name: string }[] = [
  { catalog: 'epic', name: 'Epic' },
  { catalog: 'xbox', name: 'Xbox' },
];

interface Delivery {
  channelId: string;
  content: string;
  title: string;
}

function platformFor(
  catalog: Catalog,
): typeof EPIC_PLATFORM | typeof XBOX_PLATFORM {
  return catalog === 'epic' ? EPIC_PLATFORM : XBOX_PLATFORM;
}

/**
 * A catalog row for the platform, in the given lifecycle state. The id
 * mirrors the state (`dev-<catalog>-pending|announced-offer`), so row-level
 * assertions in the spec read directly.
 */
function gameFor(catalog: Catalog, broadcasted = false) {
  const id = `dev-${catalog}-${broadcasted ? 'announced' : 'pending'}-offer`;
  return catalog === 'epic'
    ? catalogEpicFactory.build({ id, broadcasted })
    : catalogXboxFactory.build({ id, broadcasted });
}

describe('Broadcast pipeline (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let runtimes: PlatformRuntime[];
  const deliveries: Delivery[] = [];

  beforeAll(async () => {
    ({ app, dataSource, runtimes } = await createTestingApp());
  });

  beforeEach(async () => {
    fetchSpy.mockReset();
    sendSpy.mockReset();
    deliveries.length = 0;
    await cleanTestDatabase(dataSource.manager);
  });

  afterAll(async () => {
    await cleanTestDatabase(dataSource.manager);
    await app.close();
  });

  it.each(catalogCases)(
    'broadcasts a pending $name game',
    async ({ catalog }) => {
      const platform = platformFor(catalog);
      const guild = guildFactory.build();
      const channel = subscriptionFactory.build({
        guildId: guild.id,
        platform: platform.type,
      });
      const game = gameFor(catalog);

      await createBroadcastScenario(dataSource.manager, {
        guilds: [guild],
        subscriptions: [channel],
        games: [game],
      });
      serveChannels();

      const announced = await runtimeOf(catalog).broadcastPending();

      expect(announced).toBe(1);
      expectDelivery(channel.id, platform.message, game.title);
      expect(await isBroadcasted(catalog, game.id)).toBe(true);
    },
  );

  it.each(catalogCases)(
    'ignores an already-broadcast $name game',
    async ({ catalog }) => {
      const announcedGame = gameFor(catalog, true);

      await createBroadcastScenario(dataSource.manager, {
        games: [announcedGame],
      });
      serveChannels();

      const announced = await runtimeOf(catalog).broadcastPending();

      // Excluded by the repository query: no subscriber's channel is even
      // probed, and the durable flag stays untouched.
      expect(announced).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(sendSpy).not.toHaveBeenCalled();
      expect(deliveries).toEqual([]);
      expect(await isBroadcasted(catalog, announcedGame.id)).toBe(true);
    },
  );

  it.each(catalogCases)(
    'broadcasts a pending $name game to multiple active subscriptions',
    async ({ catalog }) => {
      const platform = platformFor(catalog);
      const guildA = guildFactory.build({ id: 'dev-guild-a' });
      const guildB = guildFactory.build({ id: 'dev-guild-b' });
      const channelA = subscriptionFactory.build({
        id: '150000000000000001',
        guildId: guildA.id,
        platform: platform.type,
      });
      const channelB = subscriptionFactory.build({
        id: '150000000000000002',
        guildId: guildB.id,
        platform: platform.type,
      });
      const game = gameFor(catalog);

      await createBroadcastScenario(dataSource.manager, {
        guilds: [guildA, guildB],
        subscriptions: [channelA, channelB],
        games: [game],
      });
      serveChannels();

      const announced = await runtimeOf(catalog).broadcastPending();

      expect(announced).toBe(1);
      expect(deliveries).toHaveLength(2);
      expectDelivery(channelA.id, platform.message, game.title);
      expectDelivery(channelB.id, platform.message, game.title);
      expect(await isBroadcasted(catalog, game.id)).toBe(true);
    },
  );

  it.each(catalogCases)(
    'skips departed guild $name subscriptions without fetching their channel',
    async ({ catalog }) => {
      const platform = platformFor(catalog);
      const activeGuild = guildFactory.build();
      const departedGuild = guildFactory.build({
        id: 'dev-guild-departed',
        deleted: true,
      });
      const activeChannel = subscriptionFactory.build({
        guildId: activeGuild.id,
        platform: platform.type,
      });
      const departedChannel = subscriptionFactory.build({
        id: '150000000000000002',
        guildId: departedGuild.id,
        platform: platform.type,
      });
      const game = gameFor(catalog);

      await createBroadcastScenario(dataSource.manager, {
        guilds: [activeGuild, departedGuild],
        subscriptions: [activeChannel, departedChannel],
        games: [game],
      });
      // Every channel would resolve — the departed one must not be asked.
      serveChannels();

      const announced = await runtimeOf(catalog).broadcastPending();

      // Regression for `broadcast-stale-subscriptions`: the stale
      // subscription is skipped before any channel fetch…
      expect(fetchSpy).not.toHaveBeenCalledWith(departedChannel.id);
      // …without blocking delivery to the active subscriber.
      expectDelivery(activeChannel.id, platform.message, game.title);
      expectNoDeliveryTo(departedChannel.id);
      expect(announced).toBe(1);
      expect(await isBroadcasted(catalog, game.id)).toBe(true);
    },
  );

  it.each(catalogCases)(
    'skips inactive $name subscriptions',
    async ({ catalog }) => {
      const platform = platformFor(catalog);
      const guild = guildFactory.build();
      const activeChannel = subscriptionFactory.build({
        guildId: guild.id,
        platform: platform.type,
      });
      const inactiveChannel = subscriptionFactory.build({
        id: '150000000000000002',
        guildId: guild.id,
        platform: platform.type,
      });
      const game = gameFor(catalog);

      await createBroadcastScenario(dataSource.manager, {
        guilds: [guild],
        subscriptions: [activeChannel, inactiveChannel],
        games: [game],
      });
      // The inactive channel no longer resolves to anything sendable.
      serveChannels([inactiveChannel.id]);

      const announced = await runtimeOf(catalog).broadcastPending();

      // Inactive ≠ departed: the channel is still probed, just never
      // delivered to — and one dead subscriber never blocks the others.
      expect(fetchSpy).toHaveBeenCalledWith(inactiveChannel.id);
      expectDelivery(activeChannel.id, platform.message, game.title);
      expectNoDeliveryTo(inactiveChannel.id);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(announced).toBe(1);
      expect(await isBroadcasted(catalog, game.id)).toBe(true);
    },
  );

  it('handles multiple guilds independently', async () => {
    const guildA = guildFactory.build({ id: 'dev-guild-a' });
    const guildB = guildFactory.build({ id: 'dev-guild-b' });
    const guildC = guildFactory.build({ id: 'dev-guild-c' });
    const aEpic = subscriptionFactory.build({
      id: '150000000000000001',
      guildId: guildA.id,
      platform: EPIC_PLATFORM.type,
    });
    const aXbox = subscriptionFactory.build({
      id: '150000000000000002',
      guildId: guildA.id,
      platform: XBOX_PLATFORM.type,
    });
    const bEpic = subscriptionFactory.build({
      id: '150000000000000003',
      guildId: guildB.id,
      platform: EPIC_PLATFORM.type,
    });
    const cXbox = subscriptionFactory.build({
      id: '150000000000000004',
      guildId: guildC.id,
      platform: XBOX_PLATFORM.type,
    });
    const epicGame = gameFor('epic');
    const xboxGame = gameFor('xbox');

    await createBroadcastScenario(dataSource.manager, {
      guilds: [guildA, guildB, guildC],
      subscriptions: [aEpic, aXbox, bEpic, cXbox],
      games: [epicGame, xboxGame],
    });
    serveChannels();

    expect(await runtimeOf('epic').broadcastPending()).toBe(1);
    expect(await runtimeOf('xbox').broadcastPending()).toBe(1);

    // Every guild receives exactly what it subscribed to — nothing leaks
    // across guilds or platforms.
    expect(deliveries).toHaveLength(4);
    expect(deliveries).toEqual(
      expect.arrayContaining([
        {
          channelId: aEpic.id,
          content: EPIC_PLATFORM.message,
          title: epicGame.title,
        },
        {
          channelId: aXbox.id,
          content: XBOX_PLATFORM.message,
          title: xboxGame.title,
        },
        {
          channelId: bEpic.id,
          content: EPIC_PLATFORM.message,
          title: epicGame.title,
        },
        {
          channelId: cXbox.id,
          content: XBOX_PLATFORM.message,
          title: xboxGame.title,
        },
      ]),
    );
    expect(await isBroadcasted('epic', epicGame.id)).toBe(true);
    expect(await isBroadcasted('xbox', xboxGame.id)).toBe(true);
  });

  it('handles mixed catalog and subscription state across guilds', async () => {
    // Catalog: one pending and one already-broadcast row per platform.
    const epicPending = gameFor('epic');
    const epicAnnounced = gameFor('epic', true);
    const xboxPending = gameFor('xbox');
    const xboxAnnounced = gameFor('xbox', true);

    // Guilds: two active — one with a channel that no longer resolves — and
    // one the bot has left.
    const guildA = guildFactory.build({ id: 'dev-guild-a' });
    const guildB = guildFactory.build({ id: 'dev-guild-b' });
    const departedGuild = guildFactory.build({
      id: 'dev-guild-departed',
      deleted: true,
    });
    const aEpic = subscriptionFactory.build({
      id: '150000000000000001',
      guildId: guildA.id,
      platform: EPIC_PLATFORM.type,
    });
    const aXbox = subscriptionFactory.build({
      id: '150000000000000002',
      guildId: guildA.id,
      platform: XBOX_PLATFORM.type,
    });
    const bEpic = subscriptionFactory.build({
      id: '150000000000000003',
      guildId: guildB.id,
      platform: EPIC_PLATFORM.type,
    });
    const inactiveXbox = subscriptionFactory.build({
      id: '150000000000000004',
      guildId: guildB.id,
      platform: XBOX_PLATFORM.type,
    });
    const departedEpic = subscriptionFactory.build({
      id: '150000000000000005',
      guildId: departedGuild.id,
      platform: EPIC_PLATFORM.type,
    });
    const departedXbox = subscriptionFactory.build({
      id: '150000000000000006',
      guildId: departedGuild.id,
      platform: XBOX_PLATFORM.type,
    });

    await createBroadcastScenario(dataSource.manager, {
      guilds: [guildA, guildB, departedGuild],
      subscriptions: [
        aEpic,
        aXbox,
        bEpic,
        inactiveXbox,
        departedEpic,
        departedXbox,
      ],
      games: [epicPending, epicAnnounced, xboxPending, xboxAnnounced],
    });
    serveChannels([inactiveXbox.id]);

    expect(await runtimeOf('epic').broadcastPending()).toBe(1);
    expect(await runtimeOf('xbox').broadcastPending()).toBe(1);

    // Reachable active subscribers receive every pending game…
    expect(deliveries).toHaveLength(3);
    expect(deliveries).toEqual(
      expect.arrayContaining([
        {
          channelId: aEpic.id,
          content: EPIC_PLATFORM.message,
          title: epicPending.title,
        },
        {
          channelId: bEpic.id,
          content: EPIC_PLATFORM.message,
          title: epicPending.title,
        },
        {
          channelId: aXbox.id,
          content: XBOX_PLATFORM.message,
          title: xboxPending.title,
        },
      ]),
    );
    // …the inactive channel is probed but never delivered to…
    expect(fetchSpy).toHaveBeenCalledWith(inactiveXbox.id);
    expectNoDeliveryTo(inactiveXbox.id);
    // …and the departed guild's channels are never fetched.
    expect(fetchSpy).not.toHaveBeenCalledWith(departedEpic.id);
    expect(fetchSpy).not.toHaveBeenCalledWith(departedXbox.id);

    // Final catalog state: pending rows announced, already-broadcast rows
    // untouched by the pass.
    expect(await isBroadcasted('epic', epicPending.id)).toBe(true);
    expect(await isBroadcasted('epic', epicAnnounced.id)).toBe(true);
    expect(await isBroadcasted('xbox', xboxPending.id)).toBe(true);
    expect(await isBroadcasted('xbox', xboxAnnounced.id)).toBe(true);
  });

  it.each(catalogCases)(
    'keeps the $name game pending when Discord delivery fails',
    async ({ catalog }) => {
      const platform = platformFor(catalog);
      const guild = guildFactory.build();
      const channel = subscriptionFactory.build({
        guildId: guild.id,
        platform: platform.type,
      });
      const game = gameFor(catalog);

      await createBroadcastScenario(dataSource.manager, {
        guilds: [guild],
        subscriptions: [channel],
        games: [game],
      });
      serveChannels();
      sendSpy.mockRejectedValue(new Error('Discord unavailable'));

      const announced = await runtimeOf(catalog).broadcastPending();

      expect(announced).toBe(0);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(deliveries).toEqual([]);
      // Constitution II: delivery first, durable state second.
      expect(await isBroadcasted(catalog, game.id)).toBe(false);
    },
  );

  function runtimeOf(catalog: Catalog): PlatformRuntime {
    const { type } = platformFor(catalog);
    const runtime = runtimes.find((candidate) => candidate.type === type);
    if (!runtime) {
      throw new Error(`platform "${type}" is not registered`);
    }
    return runtime;
  }

  async function isBroadcasted(catalog: Catalog, id: string): Promise<boolean> {
    const row =
      catalog === 'epic'
        ? await dataSource.getRepository(CatalogEpic).findOneByOrFail({ id })
        : await dataSource.getRepository(CatalogXbox).findOneByOrFail({ id });
    return row.broadcasted;
  }

  /**
   * Installs the Discord boundary for one test: every fetched channel
   * resolves to a fake text channel that records the delivery after a
   * successful send, except ids listed as unreachable — those resolve to
   * null, the way a channel the bot can no longer see would.
   */
  function serveChannels(unreachable: string[] = []): void {
    const missing = new Set(unreachable);
    fetchSpy.mockImplementation(async (id) => {
      if (missing.has(id)) {
        return null;
      }
      return fakeTextChannel(id, async (payload) => {
        const details = messageDetails(payload);
        const result = await sendSpy(payload);
        deliveries.push({ channelId: id, ...details });
        return result;
      });
    });
  }

  function expectDelivery(
    channelId: string,
    content: string,
    title: string,
  ): void {
    expect(deliveries).toContainEqual({ channelId, content, title });
  }

  function expectNoDeliveryTo(channelId: string): void {
    expect(
      deliveries.filter((delivery) => delivery.channelId === channelId),
    ).toEqual([]);
  }
});

function messageDetails(payload: unknown): Pick<Delivery, 'content' | 'title'> {
  if (
    !isRecord(payload) ||
    typeof payload.content !== 'string' ||
    !isUnknownArray(payload.embeds)
  ) {
    throw new Error('Broadcast produced an invalid Discord message payload');
  }

  const embed = payload.embeds[0];
  if (
    !isRecord(embed) ||
    !isRecord(embed.data) ||
    typeof embed.data.title !== 'string'
  ) {
    throw new Error('Broadcast produced an embed without a title');
  }

  return { content: payload.content, title: embed.data.title };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}
