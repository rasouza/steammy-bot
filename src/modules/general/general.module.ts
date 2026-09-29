import { Module } from '@nestjs/common';
import { GeneralCommands } from './general.commands.js';

@Module({
  providers: [GeneralCommands],
})
export class GeneralModule {}
