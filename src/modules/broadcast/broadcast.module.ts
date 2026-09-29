import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subscription } from '../../database/entities/index.js';
import { BroadcastService } from './broadcast.service.js';
import { GameEmbedService } from './game-embed.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription])],
  providers: [BroadcastService, GameEmbedService],
  exports: [BroadcastService, GameEmbedService],
})
export class BroadcastModule {}
