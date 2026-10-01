import type {
  XboxApiGame,
  XboxCatalogIdResponse,
} from '../../../src/gamesources/xbox/xbox.types.js';

/**
 * HTTP fixtures for the sync e2e suite: the sigls id list and the products
 * enrichment body, typed against the DTOs `XboxApi.fetch()` navigates. Store
 * ids carry the `dev-` prefix so `purgeFixtureRows` owns them.
 */

/** The sigls list id `XboxApi` hardcodes. */
export const XBOX_GAME_TYPE_ID = 'fdd9e2a7-0fee-49f6-ad69-4354098401ff';

/** A header row (no `id` key) followed by two catalog ids — only ids survive. */
export const siglsResponse: XboxCatalogIdResponse[] = [
  {
    siglId: 'dev-sigl-header',
    title: 'Dev Fixture List',
    description: 'Header row without an id.',
    requiresShuffling: 'False',
    imageUrl: 'https://example.invalid/sigl.jpg',
  },
  { id: 'dev-xbox-premium-offer' },
  { id: 'dev-xbox-free-offer' },
];

/** Ids `XboxApi` must forward to the products POST, in sigls order. */
export const EXPECTED_XBOX_IDS = [
  'dev-xbox-premium-offer',
  'dev-xbox-free-offer',
];

const premiumOffer: XboxApiGame = {
  StoreId: 'dev-xbox-premium-offer',
  ProductTitle: 'Fixture Premium Game',
  DeveloperName: 'Fixture Studio',
  ImageHero: {
    URI: 'https://example.invalid/hero-premium.jpg',
    Width: 3840,
    Height: 2160,
  },
  Price: { MSRP: '$19.99', SalesPrice: '$19.99', IsFree: false },
  ApproximateSizeInBytes: 5368709120,
  ProductDescription: 'A premium fixture title.',
};

const freeOffer: XboxApiGame = {
  StoreId: 'dev-xbox-free-offer',
  ProductTitle: 'Fixture Free Game',
  DeveloperName: 'Fixture Studio',
  ImageHero: {
    URI: 'https://example.invalid/hero-free.jpg',
    Width: 3840,
    Height: 2160,
  },
  Price: { MSRP: '$0.00', SalesPrice: '$0.00', IsFree: true },
  ApproximateSizeInBytes: 1073741824,
  ProductDescription: 'A free fixture title.',
};

/** The body `XboxApi` reads `Object.values(data.Products)` from. */
export const productsResponse = {
  Products: {
    'dev-xbox-premium-offer': premiumOffer,
    'dev-xbox-free-offer': freeOffer,
  },
};
