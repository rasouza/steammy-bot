import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { DatabaseConfig } from '../config/index.js';
import { buildDataSourceOptions, entities } from './data-source-options.js';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        buildDataSourceOptions(
          configService.getOrThrow<DatabaseConfig>('database'),
          { migrationsRun: true },
        ),
    }),
    TypeOrmModule.forFeature(entities),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
