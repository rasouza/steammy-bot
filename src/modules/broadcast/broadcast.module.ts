import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CatalogEpic,
  CatalogXbox,
  Subscription,
} from '../../database/entities';
import { BroadcastService } from './broadcast.service';
import { GameEmbedService } from './game-embed.service';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogEpic, CatalogXbox, Subscription])],
  providers: [BroadcastService, GameEmbedService],
  exports: [BroadcastService, GameEmbedService],
})
export class BroadcastModule {}
