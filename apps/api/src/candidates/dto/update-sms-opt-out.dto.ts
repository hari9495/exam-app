import { IsBoolean } from 'class-validator';

export class UpdateSmsOptOutDto {
  @IsBoolean()
  optedOut!: boolean;
}
