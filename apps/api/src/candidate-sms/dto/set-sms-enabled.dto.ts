import { IsBoolean } from 'class-validator';

export class SetSmsEnabledDto {
  @IsBoolean() enabled!: boolean;
}
