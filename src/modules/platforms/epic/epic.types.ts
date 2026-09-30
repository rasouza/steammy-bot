import type { Game } from '../platform.types.js';

/**
 * Epic-only in-memory shapes, moved out of the retired shared types folder (research
 * R11): the common game model, native API DTOs, and the storefront-specific
 * extension the mapper produces.
 */

export interface EpicGame extends Game {
  offer_start_at: Date;
  offer_end_at: Date;
  /** Transient mapping detail — not an entity column; stripped before persisting. */
  offer?: {
    discount?: number;
    upcoming: boolean;
  };
}

export interface EpicApiImage {
  type: string;
  url: string;
}

export interface EpicApiPrice {
  totalPrice: {
    discountPrice: number;
    originalPrice: number;
    discount: number;
    currencyCode: string;
  };
}

export interface EpicApiPromotionalOffer {
  promotionalOffers: {
    startDate: string;
    endDate: string;
    discountSetting: {
      discountType: string;
      discountPercentage: number;
    };
  }[];
}

export interface EpicApiGame {
  id: string;
  title: string;
  description: string;
  expiryDate: string;
  status: string;
  keyImages: EpicApiImage[];
  promotions: {
    promotionalOffers: EpicApiPromotionalOffer[];
    upcomingPromotionalOffers: EpicApiPromotionalOffer[];
  };
  price: EpicApiPrice;
}

export interface FreeGamesPromotionApiResponse {
  data: {
    Catalog: {
      searchStore: {
        elements: EpicApiGame[];
      };
    };
  };
}
