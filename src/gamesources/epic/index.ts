import { defineGameSource } from '../../modules/platforms/define-gamesource.js';
import { EpicApi } from './epic.api.js';
import { EpicMapper } from './epic.mapper.js';
import { EpicRepository } from './epic.repository.js';

/**
 * Epic's complete registration — every artifact this platform owns lives in
 * this subfolder, and the platform declares itself with one definition
 * (spec FR-002). The `platform` literal is the platform's identity: the key
 * union, display names, and Discord choices all derive from the registered
 * definitions, so this file plus the central list is the whole integration.
 * The message string is byte-locked by
 * `src/modules/platforms/platform.registry.spec.ts` (FR-005).
 */
export const EPIC_PLATFORM = defineGameSource({
  platform: 'epic',
  name: 'Epic Games',
  message: 'New free game available on **Epic Games**',
  api: EpicApi,
  mapper: EpicMapper,
  repository: EpicRepository,
});
