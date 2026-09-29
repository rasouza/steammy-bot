import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { databaseConfig, envSchema } from './config/index.js';
import { DatabaseModule } from './database/database.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { BotModule } from './modules/bot/bot.module.js';
import { BroadcastModule } from './modules/broadcast/broadcast.module.js';
import { GeneralModule } from './modules/general/general.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { PlatformsModule } from './modules/platforms/platforms.module.js';
import { SubscriptionModule } from './modules/subscription/subscription.module.js';

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
