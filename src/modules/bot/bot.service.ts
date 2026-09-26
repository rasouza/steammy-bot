import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ActivityType } from 'discord.js';
import { Context, On, Once } from 'necord';
import type { ContextOf } from 'necord';
import { Repository } from 'typeorm';
import { Guild } from '../../database/entities';

@Injectable()
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @InjectRepository(Guild)
    private readonly guildRepository: Repository<Guild>,
  ) {}

  @Once('ready')
  public onReady(@Context() [client]: ContextOf<'ready'>) {
    this.logger.log(`Steammy Bot is ready! Logged in as ${client.user.tag}`);
    client.user.setActivity('free games', { type: ActivityType.Watching });
  }

  @On('guildCreate')
  public async onGuildCreate(@Context() [guild]: ContextOf<'guildCreate'>) {
    this.logger.log(`Joined guild: ${guild.name} (${guild.id})`);
    try {
      await this.guildRepository.upsert(
        {
          id: guild.id,
          deleted: false,
          lastInteract: new Date(),
        },
        ['id'],
      );
    } catch (error) {
      this.logger.error(`Failed to register guild ${guild.id}: ${error}`);
    }
  }

  @On('guildDelete')
  public async onGuildDelete(@Context() [guild]: ContextOf<'guildDelete'>) {
    this.logger.log(`Left guild: ${guild.name} (${guild.id})`);
    try {
      await this.guildRepository.update({ id: guild.id }, { deleted: true });
    } catch (error) {
      this.logger.error(`Failed to update deleted guild ${guild.id}: ${error}`);
    }
  }
}
