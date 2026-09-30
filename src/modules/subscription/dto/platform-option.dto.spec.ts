import 'reflect-metadata';
import { gameSources } from '../../../gamesources/index.js';
import { PlatformOptionDto } from './platform-option.dto.js';

/** Metadata key necord's option decorators write to (`option.util.js`). */
const OPTIONS_METADATA = 'necord:options_meta';

interface StringOptionMetadata {
  name: string;
  description: string;
  required: boolean;
  choices: { name: string; value: string }[];
}

function platformOption(): StringOptionMetadata {
  const options = Reflect.getOwnMetadata(
    OPTIONS_METADATA,
    PlatformOptionDto.prototype,
  ) as Record<string, StringOptionMetadata>;

  return options['platform'];
}

/**
 * The choices Discord sees are derived from the central registration list, so
 * they can never disagree with it: registering a platform adds its choice,
 * deregistering removes it — no edit to this DTO, ever.
 */
describe('PlatformOptionDto', () => {
  it('derives its Discord choices from the central registration list', () => {
    expect(platformOption().choices).toEqual(
      gameSources.map((definition) => ({
        name: definition.name,
        value: definition.type,
      })),
    );
  });

  it('offers the current platforms under their display names', () => {
    expect(platformOption().choices).toContainEqual({
      name: 'Epic Games',
      value: 'epic',
    });
    expect(platformOption().choices).toContainEqual({
      name: 'Xbox Game Pass',
      value: 'xbox',
    });
  });
});
