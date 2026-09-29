import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import chalk from 'chalk';
import type {
  XboxApiGame,
  XboxCatalogIdResponse,
} from '../../../shared/types/index.js';
import type { PlatformApi } from '../platform.types.js';

/**
 * Fetch step for Xbox (moved from `xbox.service.ts`): id-list first, then
 * product enrichment. Returns native API rows — mapping lives in
 * {@link XboxMapper}.
 */
@Injectable()
export class XboxApi implements PlatformApi<XboxApiGame> {
  private readonly logger = new Logger(XboxApi.name);
  private readonly apiUrl = 'https://catalog.gamepass.com';
  private readonly gameTypeId = 'fdd9e2a7-0fee-49f6-ad69-4354098401ff';
  private readonly language = 'en-US';
  private readonly market = 'US';
  private readonly hydration = 'MobileDetailsForConsole';

  async fetch(): Promise<XboxApiGame[]> {
    const gameIds = await this.fetchAllIds();

    return this.enrichGameCatalog(gameIds);
  }

  private async fetchAllIds(): Promise<string[]> {
    const { data }: { data: XboxCatalogIdResponse[] } = await axios.get(
      `${this.apiUrl}/sigls/v2`,
      {
        params: {
          id: this.gameTypeId,
          language: this.language,
          market: this.market,
        },
      },
    );

    const gameIds: string[] = data.reduce((list: string[], game) => {
      if ('id' in game) {
        list.push(game.id);
      }

      return list;
    }, []);

    this.logger.log(
      `[Xbox API] Fetched ${chalk.bold.green(gameIds.length.toString())} IDs`,
    );

    return gameIds;
  }

  private async enrichGameCatalog(gameIds: string[]): Promise<XboxApiGame[]> {
    if (gameIds.length === 0) return [];

    const body = {
      Products: gameIds,
    };
    const params = {
      params: {
        market: this.market,
        language: this.language,
        hydration: this.hydration,
      },
    };

    const { data } = await axios.post(`${this.apiUrl}/products`, body, params);
    const gameList: XboxApiGame[] = Object.values(data.Products || {});
    this.logger.log(
      `[Xbox API] Enriched catalog for ${chalk.bold.green(gameIds.length.toString())} IDs`,
    );

    return gameList;
  }
}
