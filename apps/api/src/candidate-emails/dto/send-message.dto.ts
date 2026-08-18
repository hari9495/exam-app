import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsOptional() @IsString() templateId?: string | null;
  @IsString() @MaxLength(300) subject!: string;
  @IsString() @MaxLength(8000) body!: string;
}
