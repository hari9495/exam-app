import { Module } from '@nestjs/common';
import { HelpController } from './help.controller';

// Help and onboarding (H-2, answer 947): Not found references.
@Module({ controllers: [HelpController] })
export class HelpModule {}
