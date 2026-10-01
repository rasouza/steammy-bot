import type { INestApplication } from '@nestjs/common';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { DataSource } from 'typeorm';
import { Like } from 'typeorm';

import { CatalogEpic, CatalogXbox } from '../src/database/entities/index.js';
import { EPIC_PLATFORM } from '../src/gamesources/epic/index.js';
import { XBOX_PLATFORM } from '../src/gamesources/xbox/index.js';
import type { PlatformRuntime } from '../src/modules/platforms/platform.types.js';
import { purgeFixtureRows } from './fixtures/db.fixture.js';
import {
  EPIC_PAID_ID,
  EPIC_QUALIFYING_ID,
  epicFreeGamesResponse,
  epicRetitledResponse,
} from './fixtures/http/epic.fixtures.js';
import {
  EXPECTED_XBOX_IDS,
  XBOX_GAME_TYPE_ID,
  productsResponse,
  siglsResponse,
} from './fixtures/http/xbox.fixtures.js';
import { createTestingApp } from './helpers/testing-app.js';

const EPIC_FREE_GAMES_URL =
  'https://store-site-backend-static-ipv4.ak.epicgames.com/freeGamesPromotions';
const SIGLS_URL = 'https://catalog.gamepass.com/sigls/v2';
const PRODUCTS_URL = 'https://catalog.gamepass.com/products';

interface RecordedRequest {
  url: URL;
  body?: unknown;
}

const recorded = {
  epic: [] as RecordedRequest[],
  sigls: [] as RecordedRequest[],
  products: [] as RecordedRequest[],
};

/**
 * MSW stands in for the storefront wire: axios is intercepted before the
 * network, so `EpicApi`/`XboxApi`, the mappers, and the repositories all run
 * for real. `onUnhandledRequest: 'error'` makes the suite offline by
 * construction — a wrong or stray URL fails the test instead of reaching
 * the internet.
 */
const server = setupServer(
  http.get(EPIC_FREE_GAMES_URL, ({ request }) => {
    recorded.epic.push({ url: new URL(request.url) });
    return HttpResponse.json(epicFreeGamesResponse());
  }),
  http.get(SIGLS_URL, ({ request }) => {
    recorded.sigls.push({ url: new URL(request.url) });
    return HttpResponse.json(siglsResponse);
  }),
  http.post(PRODUCTS_URL, async ({ request }) => {
    recorded.products.push({
      url: new URL(request.url),
      body: await request.json(),
    });
    return HttpResponse.json(productsResponse);
  }),
);

/**
 * Sync pipeline contract, end to end: real `GenericPlatform` with the real
 * Epic/Xbox API adapters, mappers, and repositories against real PostgreSQL
 * (schema + migrations applied by `DatabaseModule`), with the storefront
 * HTTP as the only mocked boundary — the same line as the broadcast suite's
 * fake Discord client.
 */
describe('Sync pipeline (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let runtimes: PlatformRuntime[];

  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'error' });
    ({ app, dataSource, runtimes } = await createTestingApp());
  });

  beforeEach(async () => {
    // Drops any per-test `server.use` override and clears the recordings.
    server.resetHandlers();
    recorded.epic.length = 0;
    recorded.sigls.length = 0;
    recorded.products.length = 0;
    await purgeFixtureRows(dataSource.manager);
  });

  afterAll(async () => {
    await purgeFixtureRows(dataSource.manager);
    server.close();
    await app.close();
  });

  function runtimeOf(platform: { type: string }): PlatformRuntime {
    const runtime = runtimes.find((r) => r.type === platform.type);
    if (!runtime) {
      throw new Error(`platform "${platform.type}" is not registered`);
    }
    return runtime;
  }

  async function epicRows(): Promise<CatalogEpic[]> {
    return dataSource
      .getRepository(CatalogEpic)
      .find({ where: { id: Like('dev-%') }, order: { id: 'ASC' } });
  }

  async function xboxRows(): Promise<CatalogXbox[]> {
    return dataSource
      .getRepository(CatalogXbox)
      .find({ where: { id: Like('dev-%') }, order: { id: 'ASC' } });
  }

  it('persists a qualifying Epic offer and drops the one that does not qualify', async () => {
    await runtimeOf(EPIC_PLATFORM).sync();

    expect(recorded.epic).toHaveLength(1);

    const rows = await epicRows();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.id).toBe(EPIC_QUALIFYING_ID);
    expect(row.title).toBe('Fixture Free Game');
    expect(row.description).toBe('A deterministic fixture offer.');
    expect(row.developer).toBe('Fixture Studio');
    expect(row.image).toBe('https://example.invalid/fixture-thumb.jpg');
    // bigint columns come back from pg as strings — Number() before arithmetic.
    expect(Number(row.price)).toBe(1999);
    expect(row.offer_start_at.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(row.offer_end_at.toISOString()).toBe('2026-10-08T00:00:00.000Z');
    expect(row.broadcasted).toBe(false);

    // The mapper's filter must keep the paid offer out of the catalog.
    expect(
      await dataSource
        .getRepository(CatalogEpic)
        .findOneBy({ id: EPIC_PAID_ID }),
    ).toBeNull();
  });

  it('re-sync upserts: one row kept, changed fields updated', async () => {
    const runtime = runtimeOf(EPIC_PLATFORM);

    await runtime.sync();
    expect(await epicRows()).toHaveLength(1);

    server.use(
      http.get(EPIC_FREE_GAMES_URL, ({ request }) => {
        recorded.epic.push({ url: new URL(request.url) });
        return HttpResponse.json(
          epicRetitledResponse('Fixture Free Game (v2)'),
        );
      }),
    );

    await runtime.sync();

    const rows = await epicRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Fixture Free Game (v2)');
  });

  it('keeps an announced Epic offer announced across re-syncs', async () => {
    const repository = dataSource.getRepository(CatalogEpic);
    const runtime = runtimeOf(EPIC_PLATFORM);

    await runtime.sync();
    await repository.update({ id: EPIC_QUALIFYING_ID }, { broadcasted: true });

    await runtime.sync();

    const row = await repository.findOneByOrFail({ id: EPIC_QUALIFYING_ID });
    // PlatformRepository.saveAll must never write `broadcasted` (FR-001).
    expect(row.broadcasted).toBe(true);
    expect(await epicRows()).toHaveLength(1);
  });

  it('enriches exactly the sigls ids and persists the mapped products', async () => {
    await runtimeOf(XBOX_PLATFORM).sync();

    // Call 1: the id list, with the parameters XboxApi hardcodes.
    expect(recorded.sigls).toHaveLength(1);
    const siglsParams = recorded.sigls[0].url.searchParams;
    expect(siglsParams.get('id')).toBe(XBOX_GAME_TYPE_ID);
    expect(siglsParams.get('language')).toBe('en-US');
    expect(siglsParams.get('market')).toBe('US');

    // Call 2: the products POST carrying those ids — header row filtered out.
    expect(recorded.products).toHaveLength(1);
    expect(recorded.products[0].body).toEqual({ Products: EXPECTED_XBOX_IDS });
    const productParams = recorded.products[0].url.searchParams;
    expect(productParams.get('market')).toBe('US');
    expect(productParams.get('language')).toBe('en-US');
    expect(productParams.get('hydration')).toBe('MobileDetailsForConsole');

    expect(await xboxRows()).toHaveLength(2);

    const [premiumId, freeId] = EXPECTED_XBOX_IDS;
    const repository = dataSource.getRepository(CatalogXbox);

    const premium = await repository.findOneByOrFail({ id: premiumId });
    expect(premium.title).toBe('Fixture Premium Game');
    expect(premium.developer).toBe('Fixture Studio');
    expect(premium.image).toBe('https://example.invalid/hero-premium.jpg');
    expect(premium.description).toBe('A premium fixture title.');
    // "$19.99" → 1999 cents; bigint columns come back as strings.
    expect(Number(premium.price)).toBe(1999);
    expect(Number(premium.size)).toBe(5368709120);
    expect(premium.broadcasted).toBe(false);

    const free = await repository.findOneByOrFail({ id: freeId });
    // "$0.00" parses to 0 cents, which the mapper collapses to null.
    expect(free.price).toBeNull();
    expect(Number(free.size)).toBe(1073741824);
  });

  it('skips the products call when the id list comes back empty', async () => {
    server.use(
      http.get(SIGLS_URL, ({ request }) => {
        recorded.sigls.push({ url: new URL(request.url) });
        return HttpResponse.json([]);
      }),
    );

    await runtimeOf(XBOX_PLATFORM).sync();

    expect(recorded.sigls).toHaveLength(1);
    expect(recorded.products).toHaveLength(0);
    expect(await xboxRows()).toHaveLength(0);
  });
});
