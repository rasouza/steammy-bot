import { merge } from 'object-mapper';
import type { EpicApiGame, EpicGame } from './epic.types.js';
import type { PlatformMapper } from '../platform.types.js';

const isDeveloper = (item: any) => item.key === 'developerName';
const isThumbnail = (item: any) => item.type === 'Thumbnail';
const isEmpty = (element: object) =>
  element?.constructor === Object && Object.keys(element).length === 0;

const MAPPER_SCHEMA = {
  title: 'title',
  id: 'id',
  description: 'description',
  'price.totalPrice.originalPrice': 'price',
  'promotions.promotionalOffers[0].promotionalOffers[0].startDate':
    'offer_start_at',
  'promotions.promotionalOffers[0].promotionalOffers[0].endDate':
    'offer_end_at',
  'promotions.upcomingPromotionalOffers[0].promotionalOffers[0].startDate':
    'offer_start_at',
  'promotions.upcomingPromotionalOffers[0].promotionalOffers[0].endDate':
    'offer_end_at',
  'promotions.upcomingPromotionalOffers[0].promotionalOffers[0].discountSetting.discountPercentage':
    'offer.discount',
  promotions: {
    key: 'offer.upcoming',
    transform: (value: any) => {
      const { promotionalOffers, upcomingPromotionalOffers } = value || {};
      if (isEmpty(promotionalOffers) && isEmpty(upcomingPromotionalOffers))
        return;

      return upcomingPromotionalOffers?.length > 0;
    },
  },
  'customAttributes[]': {
    key: 'developer',
    transform(value: any) {
      if (Array.isArray(value)) {
        const developer = value.filter(isDeveloper);
        if (developer.length > 0) {
          return developer[0].value;
        }
      }
    },
  },
  'keyImages[]': {
    key: 'image',
    transform: (value: any) => {
      if (isEmpty(value)) return;
      const image = value.filter(isThumbnail)[0]?.url;

      return image;
    },
  },
};

/**
 * Translate step for Epic (moved from `epic.service.ts::fetchGames`).
 * Preserves the original sync filter verbatim: only upcoming promotions
 * with a 0% discount are persisted, and the transient `offer` detail is
 * stripped because it is not an entity column. Sources that do not
 * qualify return `null` and are never persisted.
 */
export class EpicMapper implements PlatformMapper<EpicApiGame, EpicGame> {
  toGame(source: EpicApiGame): EpicGame | null {
    const game = merge(source, MAPPER_SCHEMA) as EpicGame;

    if (!game.offer?.upcoming || game.offer?.discount !== 0) {
      return null;
    }

    const { offer: _offer, ...gameWithoutOffer } = game;
    return gameWithoutOffer;
  }
}
