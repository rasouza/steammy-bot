import { defineGameSource } from '../../modules/platforms/define-gamesource.js';
import { GamePlatform } from '../game-platform.js';
import { XboxApi } from './xbox.api.js';
import { XboxMapper } from './xbox.mapper.js';
import { XboxRepository } from './xbox.repository.js';

/**
 * Xbox's complete registration — every artifact this platform owns lives in
 * this subfolder, and the platform declares itself with one definition
 * (spec FR-002). The message string is byte-locked by
 * `src/modules/platforms/platform.registry.spec.ts` (FR-005).
 */
export const XBOX_PLATFORM = defineGameSource({
  platform: GamePlatform.XBOX,
  name: 'Xbox Game Pass',
  message: 'New game available on **Xbox Game Pass**',
  api: XboxApi,
  mapper: XboxMapper,
  repository: XboxRepository,
});
