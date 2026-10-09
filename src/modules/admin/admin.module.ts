import { Module } from '@nestjs/common';
import { BroadcastModule } from '../broadcast/broadcast.module.js';
import { PlatformsModule } from '../platforms/platforms.module.js';
import { AdminCommands } from './admin.commands.js';
import { DevCommands } from './dev.commands.js';

@Module({
  imports: [PlatformsModule, BroadcastModule],
  providers: [AdminCommands, DevCommands],
})
export class AdminModule {}
