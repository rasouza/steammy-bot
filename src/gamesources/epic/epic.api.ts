import { Injectable } from '@nestjs/common';
import axios from 'axios';
import type {
  EpicApiGame,
  FreeGamesPromotionApiResponse,
} from './epic.types.js';
import type { PlatformApi } from '../../modules/platforms/platform.types.js';

/**
 * Fetch step for Epic's free-games promotions endpoint (moved from
 * `epic.service.ts::fetchCatalog`). Returns native API rows only —
 * filtering and mapping live in {@link EpicMapper}.
 */
@Injectable()
export class EpicApi implements PlatformApi<EpicApiGame> {
  private readonly apiUrl =
    'https://store-site-backend-static-ipv4.ak.epicgames.com';

  async fetch(): Promise<EpicApiGame[]> {
    const { data }: { data: FreeGamesPromotionApiResponse } = await axios.get(
      `${this.apiUrl}/freeGamesPromotions`,
    );

    return data.data.Catalog.searchStore.elements;
  }
}
