import { IsBoolean } from 'class-validator';

export class SetWhatsappTemplateEnabledDto {
  @IsBoolean() enabled!: boolean;
}
