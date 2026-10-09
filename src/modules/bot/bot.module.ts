import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayIntentBits } from 'discord.js';
import { NecordModule } from 'necord';
import { Guild } from '../../database/entities/index.js';
import { BotService } from './bot.service.js';
import { CommandScopeService } from './command-scope.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Guild]),
    NecordModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const testGuildId = config.get<string>('TEST_GUILD_ID');
        const isDev = config.get<string>('NODE_ENV') === 'development';

        return {
          token: config.get<string>('BOT_TOKEN') || '',
          intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
          development: isDev && testGuildId ? [testGuildId] : false,
        };
      },
    }),
  ],
  // CommandScopeService owns the registry pruning (contracts §1); it must be
  // a provider of this module so its onModuleInit runs at the distance-1
  // position that guarantees Necord's cache is already populated (research R1).
  providers: [BotService, CommandScopeService],
  exports: [NecordModule],
})
export class BotModule {}
