import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import chalk from 'chalk';
import { Repository } from 'typeorm';
import { Guild, Subscription } from '../../database/entities/index.js';
import type { GamePlatformType } from '../../gamesources/game-platform.js';

export class SubscriptionAlreadyExistsError extends Error {
  constructor() {
    super('Subscription already exists');
    this.name = 'SubscriptionAlreadyExistsError';
  }
}

export class SubscriptionNotFoundError extends Error {
  constructor() {
    super('Subscription not found');
    this.name = 'SubscriptionNotFoundError';
  }
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Guild)
    private readonly guildRepository: Repository<Guild>,
  ) {}

  async add(
    platform: GamePlatformType,
    channelId: string,
    channelName: string,
    guildId: string,
    guildName: string,
  ): Promise<void> {
    // Ensure guild entity exists to satisfy foreign key constraint
    await this.guildRepository.upsert(
      {
        id: guildId,
        lastInteract: new Date(),
      },
      ['id'],
    );

    const existing = await this.subscriptionRepository.findOne({
      where: { id: channelId, platform, guildId },
    });

    if (existing) {
      throw new SubscriptionAlreadyExistsError();
    }

    await this.subscriptionRepository.save({
      id: channelId,
      platform,
      guildId,
    });

    this.logger.log(
      `Added ${chalk.bold.green(platform)} subscription for channel ${chalk.bold.blue(`#${channelName}`)} in guild ${chalk.bold.blue(guildName)}`,
    );
  }

  async remove(
    platform: GamePlatformType,
    channelId: string,
    channelName: string,
    guildId: string,
    guildName: string,
  ): Promise<void> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id: channelId, platform, guildId },
    });

    if (!subscription) {
      throw new SubscriptionNotFoundError();
    }

    await this.subscriptionRepository.remove(subscription);

    this.logger.log(
      `Removed ${chalk.bold.green(platform)} subscription for channel ${chalk.bold.blue(`#${channelName}`)} in guild ${chalk.bold.blue(guildName)}`,
    );
  }
}
