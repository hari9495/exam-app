import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendSmsDto {
  @IsOptional() @IsString() templateId?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(1600) body!: string;
}
