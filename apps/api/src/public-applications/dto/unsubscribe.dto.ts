import { IsBoolean } from 'class-validator';

export class UnsubscribeDto {
  @IsBoolean() optedOut!: boolean;
}

/** Answer 561: the status page's WhatsApp tick. */
export class WhatsappOptInDto {
  @IsBoolean() optIn!: boolean;
}
