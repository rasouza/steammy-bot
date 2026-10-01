import { ConfigModule } from '@nestjs/config';
import { Global, Module, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Client } from 'discord.js';
import type { DataSource } from 'typeorm';
import type { Mock } from 'vitest';

import { databaseConfig, envSchema } from '../src/config/index.js';
import { DatabaseModule } from '../src/database/database.module.js';
import { CatalogEpic } from '../src/database/entities/index.js';
import { EPIC_PLATFORM } from '../src/gamesources/epic/index.js';
import { PlatformsModule } from '../src/modules/platforms/platforms.module.js';
import { PLATFORM_REGISTRY } from '../src/modules/platforms/platform.tokens.js';
import type { PlatformRuntime } from '../src/modules/platforms/platform.types.js';
import {
  ACTIVE_CHANNEL_ID,
  ACTIVE_GUILD_ID,
  PENDING_GAME_ID,
  STALE_CHANNEL_ID,
  STALE_GUILD_ID,
  ensureDatabaseSchema,
  fakeTextChannel,
  purgeFixtureRows,
  seedEpicSubscription,
  seedGuild,
  seedPendingEpicGame,
} from './fixtures/broadcast.fixture.js';

/**
 * Mirrors how production gets its `Client`: NecordModule is `@Global()`, so
 * `BroadcastModule` resolves the token without importing anything. The fake
 * delegates to the per-test spy, which is assigned before the module compiles.
 */
let fetchSpy: Mock<(id: string) => Promise<unknown>>;
let sendSpy: Mock<(payload: unknown) => Promise<unknown>>;

@Global()
@Module({
  providers: [
    {
      provide: Client,
      useValue: { channels: { fetch: (id: string) => fetchSpy(id) } },
    },
  ],
  exports: [Client],
})
class TestDiscordModule {}

/**
 * Broadcast pipeline contract, end to end: real `GenericPlatform` and real
 * `BroadcastService` against real PostgreSQL (schema + migrations applied by
 * `DatabaseModule`), with exactly one mocked boundary — the Discord client
 * provided here in place of Necord's. Nothing logs in, nothing is posted.
 *
 * The stale-guild case is the executable regression test for the production
 * `broadcast-stale-subscriptions` bug: a subscription pointing at a guild the
 * bot has left must be skipped before any channel fetch, without preventing
 * delivery to the active subscriber.
 */
describe('Broadcast pipeline (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let runtimes: PlatformRuntime[];

  beforeAll(async () => {
    fetchSpy = vi.fn<(id: string) => Promise<unknown>>();
    sendSpy = vi.fn<(payload: unknown) => Promise<unknown>>();

    await ensureDatabaseSchema();

    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env',
          load: [databaseConfig],
          validationSchema: envSchema,
        }),
        DatabaseModule,
        PlatformsModule,
        TestDiscordModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    dataSource = moduleRef.get<DataSource>(getDataSourceToken());
    runtimes = moduleRef.get<PlatformRuntime[]>(PLATFORM_REGISTRY);
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

  /** Active guild + subscription + one pending Epic offer. */
  async function seedActiveScenario(): Promise<void> {
    await seedGuild(dataSource.manager, ACTIVE_GUILD_ID, false);
    await seedEpicSubscription(
      dataSource.manager,
      ACTIVE_CHANNEL_ID,
      ACTIVE_GUILD_ID,
    );
    await seedPendingEpicGame(dataSource.manager);
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
    await seedGuild(dataSource.manager, STALE_GUILD_ID, true);
    await seedEpicSubscription(
      dataSource.manager,
      STALE_CHANNEL_ID,
      STALE_GUILD_ID,
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
    await seedPendingEpicGame(dataSource.manager, true);
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
