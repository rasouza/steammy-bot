import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import chalk from 'chalk';
import { ChannelType, Client } from 'discord.js';
import { Repository } from 'typeorm';
import { Subscription } from '../../database/entities/index.js';
import type { GamePlatformType } from '../platforms/platform.constants.js';
import type { Game } from '../platforms/platform.types.js';
import type { SendOutcome } from '../platforms/platform.types.js';
import { GameEmbedService } from './game-embed.service.js';

/**
 * Discord delivery ONLY: no catalog entities, no eligibility, no crons
 * (spec FR-006/FR-014). The generic platform lifecycle owns when to call
 * `send` and what to do with the result (contracts §4).
 */
@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly client: Client,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    private readonly embed: GameEmbedService,
  ) {}

  async send(
    message: string,
    game: Game,
    platform: GamePlatformType,
  ): Promise<SendOutcome> {
    const subscriptions = await this.subscriptionRepository.find({
      where: { platform },
      relations: { guild: true },
    });

    const embed = this.embed.build(game);
    const subscribers = subscriptions.length;
    let delivered = 0;

    for (const subscription of subscriptions) {
      // Subscriptions of guilds the bot has been removed from survive in the
      // table (`guildDelete` only flips `guild.deleted`; the FK cascades on
      // hard deletes only), so filter them out before paying for a fetch.
      if (subscription.guild?.deleted) {
        this.logger.debug(
          `Skipping broadcast to channel ${subscription.id}: guild ${subscription.guildId} is no longer served`,
        );
        continue;
      }

      try {
        const channel = await this.client.channels.fetch(subscription.id);

        if (channel && channel.type === ChannelType.GuildText) {
          this.logger.log(
            `Sending ${chalk.bold.green(game.title)} game broadcast to ${chalk.bold.blue(`#${channel.name}`)} in guild ${chalk.bold.blue(channel.guild.name)}`,
          );
          await channel.send({
            content: message,
            embeds: [embed],
          });
          delivered++;
        }
      } catch (error) {
        this.logger.warn(
          `Could not send broadcast to channel ${subscription.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // One failed channel among many never throws (A-004); the caller decides
    // what to mark based on these counts (contracts §4 / spec FR-010).
    return { delivered, subscribers };
  }
}
