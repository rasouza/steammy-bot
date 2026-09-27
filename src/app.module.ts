import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { databaseConfig, envSchema } from './config';
import { DatabaseModule } from './database/database.module';
import { AdminModule } from './modules/admin/admin.module';
import { BotModule } from './modules/bot/bot.module';
import { BroadcastModule } from './modules/broadcast/broadcast.module';
import { GeneralModule } from './modules/general/general.module';
import { HealthModule } from './modules/health/health.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [databaseConfig],
      validationSchema: envSchema,
    }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    BotModule,
    PlatformsModule,
    BroadcastModule,
    SubscriptionModule,
    AdminModule,
    GeneralModule,
    HealthModule,
  ],
})
export class AppModule {}
