import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogEpic, CatalogXbox, Guild, Subscription } from './entities';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DATABASE_HOST', 'localhost'),
        port: configService.get<number>('DATABASE_PORT', 5432),
        ssl: configService.get<string>('DATABASE_SSL') === 'true',
        username: configService.get<string>('DATABASE_USER', 'postgres'),
        password: configService.get<string>('DATABASE_PASSWORD', 'postgres'),
        database: configService.get<string>('DATABASE_NAME', 'steammy_bot'),
        schema: configService.get<string>('DATABASE_SCHEMA', 'steammy_bot'),
        entities: [CatalogEpic, CatalogXbox, Guild, Subscription],
        synchronize:
          configService.get<string>('DATABASE_SYNCHRONIZE') === 'true',
        logging: configService.get<string>('NODE_ENV') === 'development',
      }),
    }),
    TypeOrmModule.forFeature([CatalogEpic, CatalogXbox, Guild, Subscription]),
  ],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
