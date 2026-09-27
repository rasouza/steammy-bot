import { Module } from '@nestjs/common';
import { BroadcastModule } from '../broadcast/broadcast.module';
import { PlatformsModule } from '../platforms/platforms.module';
import { AdminCommands } from './admin.commands';

@Module({
  imports: [PlatformsModule, BroadcastModule],
  providers: [AdminCommands],
})
export class AdminModule {}
