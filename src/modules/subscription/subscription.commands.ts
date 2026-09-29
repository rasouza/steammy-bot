import { Injectable } from '@nestjs/common';
import { ChannelType, MessageFlags } from 'discord.js';
import { Context, Options, SlashCommand } from 'necord';
import type { SlashCommandContext } from 'necord';
import { GamePlatformName } from '../platforms/platform.constants.js';
import { PlatformOptionDto } from './dto/platform-option.dto.js';
import {
  SubscriptionAlreadyExistsError,
  SubscriptionNotFoundError,
  SubscriptionService,
} from './subscription.service.js';

@Injectable()
export class SubscriptionCommands {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @SlashCommand({
    name: 'subscribe',
    description:
      'Subscribe for gaming offer news from platforms like Gamepass, Epic, etc.',
  })
  async onSubscribe(
    @Context() [interaction]: SlashCommandContext,
    @Options() { platform }: PlatformOptionDto,
  ) {
    const { channel, guild } = interaction;

    if (!guild || !channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: 'This command can only be used in guild text channels.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await this.subscriptionService.add(
        platform,
        channel.id,
        channel.name,
        guild.id,
        guild.name,
      );

      return interaction.reply(
        `**#${channel.name}** subscribed to **${GamePlatformName[platform]}** news`,
      );
    } catch (error) {
      if (error instanceof SubscriptionAlreadyExistsError) {
        return interaction.reply(
          `This channel is already subscribed to **${GamePlatformName[platform]}** news`,
        );
      }

      return interaction.reply({
        content: 'An error occurred while subscribing.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  @SlashCommand({
    name: 'unsubscribe',
    description: 'Remove subscription from gaming platforms',
  })
  async onUnsubscribe(
    @Context() [interaction]: SlashCommandContext,
    @Options() { platform }: PlatformOptionDto,
  ) {
    const { channel, guild } = interaction;

    if (!guild || !channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: 'This command can only be used in guild text channels.',
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      await this.subscriptionService.remove(
        platform,
        channel.id,
        channel.name,
        guild.id,
        guild.name,
      );

      return interaction.reply(
        `**#${channel.name}** unsubscribed from **${GamePlatformName[platform]}** news`,
      );
    } catch (error) {
      if (error instanceof SubscriptionNotFoundError) {
        return interaction.reply(
          `This channel is **not** subscribed to **${GamePlatformName[platform]}** news`,
        );
      }

      return interaction.reply({
        content: 'An error occurred while unsubscribing.',
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
