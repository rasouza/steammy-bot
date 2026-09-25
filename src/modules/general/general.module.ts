import { Module } from '@nestjs/common'
import { GeneralCommands } from './general.commands'

@Module({
	providers: [GeneralCommands],
})
export class GeneralModule {}
