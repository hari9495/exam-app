import { IsBoolean } from 'class-validator';

export class UnsubscribeDto {
  @IsBoolean() optedOut!: boolean;
}
