import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import chalk from 'chalk';
import { ChannelType, Client, EmbedBuilder } from 'discord.js';
import { Repository } from 'typeorm';
import { Subscription } from '../../database/entities/index.js';
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

  /**
   * Discord delivery for one game.
   *
   * `recipient` is contracts §4: when `/dev broadcast` supplies the channel
   * the operator typed in, that channel *is* the audience — so the
   * subscription query is skipped outright (R-4.1) and exactly one message is
   * built and sent (FR-016). When it is absent the behaviour is the one every
   * other caller has always had (R-4.2).
   *
   * One send, not a second sender: the recipient only changes *where* the
   * single delivery goes.
   */
  async send(
    message: string,
    game: Game,
    platform: string,
    recipient?: string,
  ): Promise<SendOutcome> {
    // R-4.1: no recipient, no change; with one, the table is never read.
    const subscriptions = recipient
      ? []
      : await this.subscriptionRepository.find({
          where: { platform },
          relations: { guild: true },
        });

    const embed = this.embed.build(game);

    // R-4.3: with an explicit recipient the audience is exactly one channel,
    // so a failed delivery reports `subscribers: 1` and never `0`.
    // `broadcastPending` marks on `delivered > 0 || subscribers === 0`, so a
    // zero here would read as "nobody to tell" and announce a game Discord
    // never saw — the pre-delivery marking Principle II forbids — or pass as
    // the legitimate "no subscribers" case that marks without sending.
    const subscribers = recipient ? 1 : subscriptions.length;
    let delivered = 0;

    if (recipient && (await this.deliver(recipient, message, embed, game))) {
      delivered++;
    }

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

      if (await this.deliver(subscription.id, message, embed, game)) {
        delivered++;
      }
    }

    // One failed channel among many never throws (A-004); the caller decides
    // what to mark based on these counts (contracts §4 / spec FR-010).
    return { delivered, subscribers };
  }

  /**
   * Fetch one channel and send one message to it.
   *
   * Shared by the subscription path and the recipient path so neither drifts:
   * a non-text channel and a failing channel both produce `false`, and
   * neither lets a Discord error escape the caller's counting.
   */
  private async deliver(
    channelId: string,
    message: string,
    embed: EmbedBuilder,
    game: Game,
  ): Promise<boolean> {
    try {
      const channel = await this.client.channels.fetch(channelId);

      if (channel && channel.type === ChannelType.GuildText) {
        this.logger.log(
          `Sending ${chalk.bold.green(game.title)} game broadcast to ${chalk.bold.blue(`#${channel.name}`)} in guild ${chalk.bold.blue(channel.guild.name)}`,
        );
        await channel.send({
          content: message,
          embeds: [embed],
        });
        return true;
      }
    } catch (error) {
      this.logger.warn(
        `Could not send broadcast to channel ${channelId}: ${error instanceof Error ? error.message : error}`,
      );
    }

    return false;
  }
}
