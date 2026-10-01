import type { INestApplication } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  CatalogEpic,
  Guild,
  Subscription,
} from '../src/database/entities/index.js';
import { EPIC_PLATFORM } from '../src/gamesources/epic/index.js';
import type { PlatformRuntime } from '../src/modules/platforms/platform.types.js';
import { catalogEpicFactory } from './factories/catalog-epic.factory.js';
import { guildFactory } from './factories/guild.factory.js';
import { subscriptionFactory } from './factories/subscription.factory.js';
import {
  ACTIVE_CHANNEL_ID,
  PENDING_GAME_ID,
  STALE_CHANNEL_ID,
  STALE_GUILD_ID,
  fakeTextChannel,
} from './fixtures/broadcast.fixture.js';
import { purgeFixtureRows } from './fixtures/db.fixture.js';
import { createTestingApp, fetchSpy, sendSpy } from './helpers/testing-app.js';

/**
 * Broadcast pipeline contract, end to end: real `GenericPlatform` and real
 * `BroadcastService` against real PostgreSQL (schema + migrations applied by
 * `DatabaseModule`), with exactly one mocked boundary — the Discord client
 * provided by the shared test module in place of Necord's. Nothing logs in,
 * nothing is posted.
 *
 * The stale-guild case is the executable regression test for the production
 * `broadcast-stale-subscriptions` bug: a subscription pointing at a guild the
 * bot has left must be skipped before any channel fetch, without preventing
 * delivery to the active subscriber.
 */
describe('Broadcast pipeline (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let runtimes: PlatformRuntime[];

  beforeAll(async () => {
    ({ app, dataSource, runtimes } = await createTestingApp());
  });

  beforeEach(async () => {
    fetchSpy.mockReset();
    sendSpy.mockReset();
    await purgeFixtureRows(dataSource.manager);
  });

  afterAll(async () => {
    await purgeFixtureRows(dataSource.manager);
    await app.close();
  });

  function epic() {
    const runtime = runtimes.find((r) => r.type === EPIC_PLATFORM.type);
    if (!runtime) {
      throw new Error(`platform "${EPIC_PLATFORM.type}" is not registered`);
    }
    return runtime;
  }

  async function pendingGameIsBroadcasted(): Promise<boolean> {
    const row = await dataSource
      .getRepository(CatalogEpic)
      .findOneByOrFail({ id: PENDING_GAME_ID });
    return row.broadcasted;
  }

  /**
   * Active guild + subscription + one pending Epic offer. The factories'
   * defaults are this scenario; persistence is the explicit `save` below.
   */
  async function seedActiveScenario(): Promise<void> {
    await dataSource.getRepository(Guild).save(guildFactory.build());
    await dataSource
      .getRepository(Subscription)
      .save(subscriptionFactory.build());
    await dataSource
      .getRepository(CatalogEpic)
      .save(catalogEpicFactory.build());
  }

  it('announces a pending game to an active subscriber and marks it broadcasted', async () => {
    await seedActiveScenario();
    fetchSpy.mockImplementation(async (id) =>
      id === ACTIVE_CHANNEL_ID
        ? fakeTextChannel('announcements', sendSpy)
        : null,
    );

    const announced = await epic().broadcastPending();

    expect(announced).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        content: EPIC_PLATFORM.message,
        embeds: [expect.anything()],
      }),
    );
    expect(await pendingGameIsBroadcasted()).toBe(true);
  });

  it('skips a departed guild without fetching its channel, and still delivers to the active one', async () => {
    await seedActiveScenario();
    await dataSource
      .getRepository(Guild)
      .save(guildFactory.build({ id: STALE_GUILD_ID, deleted: true }));
    await dataSource.getRepository(Subscription).save(
      subscriptionFactory.build({
        id: STALE_CHANNEL_ID,
        guildId: STALE_GUILD_ID,
      }),
    );
    fetchSpy.mockImplementation(async (id) =>
      id === ACTIVE_CHANNEL_ID
        ? fakeTextChannel('announcements', sendSpy)
        : fakeTextChannel('ghost', sendSpy),
    );

    const announced = await epic().broadcastPending();

    // The stale subscription must not even cost a channel fetch…
    expect(fetchSpy).not.toHaveBeenCalledWith(STALE_CHANNEL_ID);
    // …and its presence must not block the valid delivery.
    expect(fetchSpy).toHaveBeenCalledWith(ACTIVE_CHANNEL_ID);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(announced).toBe(1);
    expect(await pendingGameIsBroadcasted()).toBe(true);
  });

  it('keeps the game pending when Discord delivery fails', async () => {
    await seedActiveScenario();
    fetchSpy.mockImplementation(async () =>
      fakeTextChannel('announcements', sendSpy),
    );
    sendSpy.mockRejectedValue(new Error('Discord unavailable'));

    const announced = await epic().broadcastPending();

    expect(announced).toBe(0);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    // Constitution II: delivery first, durable state second.
    expect(await pendingGameIsBroadcasted()).toBe(false);
  });

  it('ignores games that were already announced', async () => {
    await seedActiveScenario();
    await dataSource
      .getRepository(CatalogEpic)
      .save(catalogEpicFactory.build({ broadcasted: true }));
    fetchSpy.mockImplementation(async () =>
      fakeTextChannel('announcements', sendSpy),
    );

    const announced = await epic().broadcastPending();

    expect(announced).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendSpy).not.toHaveBeenCalled();
    expect(await pendingGameIsBroadcasted()).toBe(true);
  });
});
