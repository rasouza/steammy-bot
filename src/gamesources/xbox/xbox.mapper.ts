import { Injectable } from '@nestjs/common';
import { merge } from 'object-mapper';
import type { Game } from '../../modules/platforms/platform.types.js';
import type { XboxApiGame } from './xbox.types.js';
import type { PlatformMapper } from '../../modules/platforms/platform.types.js';

const MAPPER_SCHEMA = {
  StoreId: 'id',
  ProductTitle: 'title',
  DeveloperName: 'developer',
  'ImageHero.URI': 'image',
  'Price.MSRP': {
    key: 'price',
    transform: (value: string) =>
      Math.round(Number(value?.slice(1)) * 100) || null,
  },
  ApproximateSizeInBytes: 'size',
  ProductDescription: 'description',
};

/**
 * Translate step for Xbox (moved from `xbox.service.ts::fetchGames`).
 * Every enriched product qualifies — there is no Epic-style filter here.
 */
@Injectable()
export class XboxMapper implements PlatformMapper<XboxApiGame, Game> {
  toGame(source: XboxApiGame): Game {
    return merge(source, {} as Game, MAPPER_SCHEMA);
  }
}
