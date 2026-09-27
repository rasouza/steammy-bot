import { GameEmbedService } from './game-embed.service';
import { Game } from '../../shared/types';

describe('GameEmbedService', () => {
  let service: GameEmbedService;

  const game: Game = {
    id: 'abc-123',
    title: 'Some Game',
    description: 'A short description.',
    developer: 'Some Studio',
    image: 'https://example.com/cover.jpg',
    price: 1999,
    size: 1024,
  };

  beforeEach(() => {
    service = new GameEmbedService();
  });

  it('builds an embed carrying the game metadata', () => {
    const embed = service.build(game).toJSON();

    expect(embed.title).toBe('Some Game');
    expect(embed.description).toBe('A short description.');
    expect(embed.image?.url).toBe(game.image);
  });

  it('formats the price from cents', () => {
    const embed = service.build(game).toJSON();

    const price = embed.fields?.find((field) => field.name === 'Price');
    expect(price?.value).toBe('$19.99');
  });

  it('includes developer and size fields when present', () => {
    const embed = service.build(game).toJSON();

    expect(embed.fields?.map((field) => field.name)).toEqual(
      expect.arrayContaining(['Price', 'Size', 'Developer']),
    );
  });

  it('omits optional fields when absent', () => {
    const embed = service
      .build({ id: 'x', title: 'Bare', description: 'Nothing else.' })
      .toJSON();

    expect(embed.fields ?? []).toHaveLength(0);
  });

  it('truncates descriptions longer than 300 characters', () => {
    const embed = service
      .build({ ...game, description: 'a'.repeat(400) })
      .toJSON();

    expect(embed.description).toHaveLength(303);
    expect(embed.description?.endsWith('...')).toBe(true);
  });

  it('omits the description when missing, since discord.js rejects empty ones', () => {
    const embed = service
      .build({ id: 'x', title: 'Bare', description: undefined as never })
      .toJSON();

    expect(embed.description).toBeUndefined();
  });
});
