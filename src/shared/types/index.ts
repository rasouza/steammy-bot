export interface Game {
  id: string;
  title: string;
  developer?: string | null;
  description: string;
  image?: string | null;
  price?: number | null;
  size?: number | null;
}

export interface EpicGame extends Game {
  offer_start_at: Date;
  offer_end_at: Date;
  /** Transient mapping detail — not an entity column; stripped before persisting. */
  offer?: {
    discount?: number;
    upcoming: boolean;
  };
}

export type XboxGame = Game;

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

export type XboxCatalogIdResponse =
  | {
      siglId: string;
      title: string;
      description: string;
      requiresShuffling: string;
      imageUrl: string;
    }
  | {
      id: string;
    };

export interface XboxApiImage {
  URI: string;
  Width: number;
  Height: number;
}

export interface XboxApiPrice {
  MSRP: string;
  SalesPrice: string;
  IsFree: boolean;
}

export interface XboxApiGame {
  StoreId: string;
  ProductTitle: string;
  DeveloperName: string;
  ImageHero: XboxApiImage;
  Price: XboxApiPrice;
  ApproximateSizeInBytes: number;
  ProductDescription: string;
}
