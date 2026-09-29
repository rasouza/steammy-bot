import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Guild, Subscription } from '../../database/entities/index.js';
import { SubscriptionCommands } from './subscription.commands.js';
import { SubscriptionService } from './subscription.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Guild])],
  providers: [SubscriptionService, SubscriptionCommands],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
