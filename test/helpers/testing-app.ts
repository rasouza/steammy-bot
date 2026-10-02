import { Global, Module, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Client } from 'discord.js';
import type { DataSource } from 'typeorm';

import { databaseConfig, envSchema } from '../../src/config/index.js';
import { DatabaseModule } from '../../src/database/database.module.js';
import { PlatformsModule } from '../../src/modules/platforms/platforms.module.js';
import { PLATFORM_REGISTRY } from '../../src/modules/platforms/platform.tokens.js';
import type { PlatformRuntime } from '../../src/modules/platforms/platform.types.js';

/**
 * The suite's TestingModule: everything production wires, minus the real
 * Discord client. Shared by the broadcast and sync specs — the broadcast path
 * exercises the fake client directly, and the sync spec still needs it
 * because `PlatformsModule` constructs `BroadcastService` for the registry.
 *
 * Mirrors how production gets its `Client`: NecordModule is `@Global()`, so
 * `BroadcastModule` resolves the token without importing anything. The fake
 * delegates to the module-level spies, which each spec resets per test.
 */
export const fetchSpy = vi.fn<(id: string) => Promise<unknown>>();
export const sendSpy = vi.fn<(payload: unknown) => Promise<unknown>>();

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

export interface TestingApp {
  app: INestApplication;
  dataSource: DataSource;
  runtimes: PlatformRuntime[];
}

/**
 * Compiles the module against the provisioned test database (Nest's
 * `DatabaseModule` runs pending migrations on init) and returns its handles.
 * The caller owns `app.close()` and the per-test cleanup.
 */
export async function createTestingApp(): Promise<TestingApp> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env.test',
        load: [databaseConfig],
        validationSchema: envSchema,
      }),
      DatabaseModule,
      PlatformsModule,
      TestDiscordModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    dataSource: moduleRef.get<DataSource>(getDataSourceToken()),
    runtimes: moduleRef.get<PlatformRuntime[]>(PLATFORM_REGISTRY),
  };
}
