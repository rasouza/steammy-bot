import { StringOption } from 'necord';
import { GamePlatform } from '../../../shared/constants.js';
import type { GamePlatformType } from '../../../shared/constants.js';

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
