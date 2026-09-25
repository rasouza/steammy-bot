import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CatalogEpic, CatalogXbox } from '@/database/entities'
import { EpicService } from './epic.service'
import { XboxService } from './xbox.service'

@Module({
	imports: [TypeOrmModule.forFeature([CatalogEpic, CatalogXbox])],
	providers: [EpicService, XboxService],
	exports: [EpicService, XboxService],
})
export class PlatformsModule {}
