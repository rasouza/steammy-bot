import { StringOption } from 'necord';
import {
  gameSources,
  type GamePlatformType,
} from '../../../gamesources/index.js';

/**
 * The `platform` option shared by `/subscribe`, `/sync`, and `/broadcast`.
 * The Discord choices are derived from the central registration list, so a
 * registered GameSource is offered automatically — this file never names a
 * platform.
 */
export class PlatformOptionDto {
  @StringOption({
    name: 'platform',
    description: 'Pick a platform',
    required: true,
    choices: gameSources.map((definition) => ({
      name: definition.name,
      value: definition.type,
    })),
  })
  platform: GamePlatformType;
}
