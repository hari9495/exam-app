import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendWhatsappDto {
  @IsOptional() @IsString() templateId?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(4000) body!: string;
}
