import { Injectable } from '@nestjs/common';
import { EmbedBuilder } from 'discord.js';
import { filesize } from 'filesize';
import { Game } from '../../shared/types';

const MAX_LENGTH = 300;

@Injectable()
export class GameEmbedService {
  build(game: Game): EmbedBuilder {
    const builder = new EmbedBuilder();
    const fields = [];
    const { title, developer, price, size, image } = game;

    builder.setTitle(title);

    // discord.js rejects an empty description, so only set it when present.
    const description = this.truncate(game.description);
    if (description) {
      builder.setDescription(description);
    }

    if (image) {
      try {
        builder.setImage(encodeURI(image));
      } catch {
        builder.setImage(image);
      }
    }

    if (price)
      fields.push({
        name: 'Price',
        value: `$${(Number(price) / 100).toFixed(2)}`,
      });
    if (size) fields.push({ name: 'Size', value: filesize(Number(size)) });
    if (developer) fields.push({ name: 'Developer', value: developer });
    if (fields.length > 0) builder.addFields(fields);

    builder.setColor(0x00a8ff);

    return builder;
  }

  private truncate(text?: string): string {
    if (!text) return '';
    if (text.length > MAX_LENGTH) {
      return `${text.slice(0, MAX_LENGTH)}...`;
    }

    return text;
  }
}
