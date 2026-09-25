import { Module } from '@nestjs/common'
import { BroadcastModule } from '@/modules/broadcast/broadcast.module'
import { PlatformsModule } from '@/modules/platforms/platforms.module'
import { AdminCommands } from './admin.commands'

@Module({
	imports: [PlatformsModule, BroadcastModule],
	providers: [AdminCommands],
})
export class AdminModule {}
