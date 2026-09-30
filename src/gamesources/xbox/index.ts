import { defineGameSource } from '../../modules/platforms/define-gamesource.js';
import { XboxApi } from './xbox.api.js';
import { XboxMapper } from './xbox.mapper.js';
import { XboxRepository } from './xbox.repository.js';

/**
 * Xbox's complete registration — every artifact this platform owns lives in
 * this subfolder, and the platform declares itself with one definition
 * (spec FR-002). The `platform` literal is the platform's identity: the key
 * union, display names, and Discord choices all derive from the registered
 * definitions, so this file plus the central list is the whole integration.
 * The message string is byte-locked by
 * `src/modules/platforms/platform.registry.spec.ts` (FR-005).
 */
export const XBOX_PLATFORM = defineGameSource({
  platform: 'xbox',
  name: 'Xbox Game Pass',
  message: 'New game available on **Xbox Game Pass**',
  api: XboxApi,
  mapper: XboxMapper,
  repository: XboxRepository,
});
