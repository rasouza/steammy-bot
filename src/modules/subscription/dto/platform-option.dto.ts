import { StringOption } from 'necord';
import {
  GamePlatform,
  type GamePlatformType,
} from '../../../gamesources/game-platform.js';

export class PlatformOptionDto {
  @StringOption({
    name: 'platform',
    description: 'Pick a platform',
    required: true,
    choices: [
      { name: 'Xbox Game Pass', value: GamePlatform.XBOX },
      { name: 'Epic Games', value: GamePlatform.EPIC },
    ],
  })
  platform: GamePlatformType;
}
