import type {
  EpicApiGame,
  FreeGamesPromotionApiResponse,
} from '../../../src/gamesources/epic/epic.types.js';

/**
 * HTTP fixtures for the sync e2e suite: response bodies shaped like the real
 * free-games endpoint, typed against the DTOs `EpicApi.fetch()` navigates.
 * IDs are deterministic fixture values for the dedicated E2E database.
 */

/**
 * `customAttributes` is where the mapper reads the developer from, but
 * `EpicApiGame` (the fetch DTO) does not declare it — the fixture type
 * carries both so `type:check` still pins the declared response shape.
 */
interface EpicFixtureGame extends EpicApiGame {
  customAttributes: { key: string; value: string; type: string }[];
}

/** An upcoming, 0%-discount offer — the only shape Epic's mapper persists. */
const qualifyingOffer: EpicFixtureGame = {
  id: 'dev-epic-qualifying-offer',
  title: 'Fixture Free Game',
  description: 'A deterministic fixture offer.',
  expiryDate: '2026-10-08T00:00:00.000Z',
  status: 'ACTIVE',
  keyImages: [
    {
      type: 'DieselListSizeV5',
      url: 'https://example.invalid/fixture-wide.jpg',
    },
    { type: 'Thumbnail', url: 'https://example.invalid/fixture-thumb.jpg' },
  ],
  promotions: {
    promotionalOffers: [],
    upcomingPromotionalOffers: [
      {
        promotionalOffers: [
          {
            startDate: '2026-10-01T00:00:00.000Z',
            endDate: '2026-10-08T00:00:00.000Z',
            discountSetting: {
              discountType: 'Percentage',
              discountPercentage: 0,
            },
          },
        ],
      },
    ],
  },
  price: {
    totalPrice: {
      discountPrice: 0,
      originalPrice: 1999,
      discount: 0,
      currencyCode: 'USD',
    },
  },
  customAttributes: [
    { key: 'developerName', value: 'Fixture Studio', type: 'DEVELOPER' },
  ],
};

/** A paid offer without a promotion — the mapper must return null for it. */
const paidOffer: EpicFixtureGame = {
  id: 'dev-epic-paid-offer',
  title: 'Paid Fixture Game',
  description: 'Must never reach the catalog.',
  expiryDate: '2026-10-08T00:00:00.000Z',
  status: 'ACTIVE',
  keyImages: [
    { type: 'Thumbnail', url: 'https://example.invalid/paid-thumb.jpg' },
  ],
  promotions: { promotionalOffers: [], upcomingPromotionalOffers: [] },
  price: {
    totalPrice: {
      discountPrice: 1999,
      originalPrice: 1999,
      discount: 0,
      currencyCode: 'USD',
    },
  },
  customAttributes: [
    { key: 'developerName', value: 'Paid Studio', type: 'DEVELOPER' },
  ],
};

export const EPIC_QUALIFYING_ID = qualifyingOffer.id;
export const EPIC_PAID_ID = paidOffer.id;

/** The exact body `EpicApi` reads `data.data.Catalog.searchStore.elements` from. */
export function epicFreeGamesResponse(
  elements: EpicFixtureGame[] = [qualifyingOffer, paidOffer],
): FreeGamesPromotionApiResponse {
  return { data: { Catalog: { searchStore: { elements } } } };
}

/** The same response with one offer re-titled — for the upsert update path. */
export function epicRetitledResponse(
  title: string,
): FreeGamesPromotionApiResponse {
  return epicFreeGamesResponse([{ ...qualifyingOffer, title }, paidOffer]);
}
