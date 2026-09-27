import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Guild, Subscription } from '../../database/entities';
import { SubscriptionCommands } from './subscription.commands';
import { SubscriptionService } from './subscription.service';

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, Guild])],
  providers: [SubscriptionService, SubscriptionCommands],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
