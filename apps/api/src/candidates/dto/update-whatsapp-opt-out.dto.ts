import { IsBoolean } from 'class-validator';

export class UpdateWhatsappOptOutDto {
  @IsBoolean()
  optedOut!: boolean;
}
