import { Module } from '@nestjs/common';
import { BroadcastModule } from '../broadcast/broadcast.module.js';
import { PlatformsModule } from '../platforms/platforms.module.js';
import { AdminCommands } from './admin.commands.js';
import { DevCommands } from './dev.commands.js';
import { TestGuildGuard } from './test-guild.guard.js';

/**
 * `TestGuildGuard` is provided here rather than in `BotModule`: it enforces
 * contracts §1 at *invocation* time and its only consumers are the two
 * command classes in this module.
 */
@Module({
  imports: [PlatformsModule, BroadcastModule],
  providers: [AdminCommands, DevCommands, TestGuildGuard],
})
export class AdminModule {}
