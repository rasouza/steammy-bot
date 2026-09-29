import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogEpic, CatalogXbox } from '../../database/entities/index.js';
import { EpicService } from './epic.service.js';
import { XboxService } from './xbox.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogEpic, CatalogXbox])],
  providers: [EpicService, XboxService],
  exports: [EpicService, XboxService],
})
export class PlatformsModule {}
