import { defineGameSource } from '../../modules/platforms/define-gamesource.js';
import { GamePlatform } from '../game-platform.js';
import { EpicApi } from './epic.api.js';
import { EpicMapper } from './epic.mapper.js';
import { EpicRepository } from './epic.repository.js';

/**
 * Epic's complete registration — every artifact this platform owns lives in
 * this subfolder, and the platform declares itself with one definition
 * (spec FR-002). The message string is byte-locked by
 * `src/modules/platforms/platform.registry.spec.ts` (FR-005).
 */
export const EPIC_PLATFORM = defineGameSource({
  platform: GamePlatform.EPIC,
  name: 'Epic Games',
  message: 'New free game available on **Epic Games**',
  api: EpicApi,
  mapper: EpicMapper,
  repository: EpicRepository,
});
