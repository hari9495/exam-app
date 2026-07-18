import { IsString, MinLength } from 'class-validator';

export class UpdateAiKeyDto {
  @IsString()
  @MinLength(1)
  apiKey!: string;
}
