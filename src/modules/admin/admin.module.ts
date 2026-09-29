import { Module } from '@nestjs/common';
import { BroadcastModule } from '../broadcast/broadcast.module.js';
import { PlatformsModule } from '../platforms/platforms.module.js';
import { AdminCommands } from './admin.commands.js';

@Module({
  imports: [PlatformsModule, BroadcastModule],
  providers: [AdminCommands],
})
export class AdminModule {}
