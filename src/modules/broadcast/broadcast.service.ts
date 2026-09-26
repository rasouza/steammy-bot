import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import chalk from 'chalk';
import { ChannelType, Client } from 'discord.js';
import { LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  CatalogEpic,
  CatalogXbox,
  Subscription,
} from '../../database/entities';
import { GamePlatform, GamePlatformType } from '../../shared/constants';
import { Game } from '../../shared/types';
import { GameEmbedService } from './game-embed.service';

@Injectable()
export class BroadcastService {
  private readonly logger = new Logger(BroadcastService.name);

  constructor(
    private readonly client: Client,
    @InjectRepository(CatalogEpic)
    private readonly epicRepository: Repository<CatalogEpic>,
    @InjectRepository(CatalogXbox)
    private readonly xboxRepository: Repository<CatalogXbox>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    private readonly embed: GameEmbedService,
  ) {}

  @Cron('10 * * * *')
  async cronEpic(): Promise<void> {
    await this.broadcastEpic();
  }

  @Cron('10 * * * *')
  async cronXbox(): Promise<void> {
    await this.broadcastXbox();
  }

  async broadcastEpic(): Promise<number> {
    const now = new Date();
    const games = await this.epicRepository.find({
      where: {
        broadcasted: false,
        offer_start_at: LessThanOrEqual(now),
        offer_end_at: MoreThanOrEqual(now),
      },
    });

    if (games.length === 0) {
      this.logger.log(
        `No new games to broadcast for ${chalk.bold.green('Epic')}`,
      );

      return 0;
    }

    this.logger.log(
      `Broadcasting ${games.length} new games for ${chalk.bold.green('Epic')}`,
    );

    for (const game of games) {
      try {
        game.broadcasted = true;
        await this.epicRepository.save(game);
        await this.send(
          'New free game available on **Epic Games**',
          game,
          GamePlatform.EPIC,
        );
      } catch (error) {
        this.logger.error(
          `Error broadcasting Epic game ${game.title}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return games.length;
  }

  async broadcastXbox(): Promise<number> {
    const games = await this.xboxRepository.find({
      where: {
        broadcasted: false,
      },
    });

    if (games.length === 0) {
      this.logger.log(
        `No new games to broadcast for ${chalk.bold.green('Xbox')}`,
      );

      return 0;
    }

    this.logger.log(
      `Broadcasting ${games.length} new games for ${chalk.bold.green('Xbox')}`,
    );

    for (const game of games) {
      try {
        game.broadcasted = true;
        await this.xboxRepository.save(game);
        await this.send(
          'New game available on **Xbox Game Pass**',
          game,
          GamePlatform.XBOX,
        );
      } catch (error) {
        this.logger.error(
          `Error broadcasting Xbox game ${game.title}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    return games.length;
  }

  private async send(
    message: string,
    game: Game,
    platform: GamePlatformType,
  ): Promise<void> {
    const subscriptions = await this.subscriptionRepository.find({
      where: { platform },
    });

    const embed = this.embed.build(game);

    for (const subscription of subscriptions) {
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
        }
      } catch (error) {
        this.logger.warn(
          `Could not send broadcast to channel ${subscription.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}
