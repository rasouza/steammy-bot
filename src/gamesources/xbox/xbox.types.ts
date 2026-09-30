/**
 * Xbox-only in-memory shapes, moved out of the retired shared types folder (research
 * R11): native API DTOs for the id-list and product-enrichment calls.
 */

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
