import { IsIn, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateAiKeyDto {
  @IsIn(['anthropic', 'openai-compatible'])
  provider!: 'anthropic' | 'openai-compatible';

  @IsString()
  @MinLength(1)
  apiKey!: string;

  @ValidateIf((dto) => dto.provider === 'openai-compatible')
  @IsString()
  @MinLength(1)
  baseUrl?: string;

  @ValidateIf((dto) => dto.provider === 'openai-compatible')
  @IsString()
  @MinLength(1)
  modelFast?: string;

  @ValidateIf((dto) => dto.provider === 'openai-compatible')
  @IsString()
  @MinLength(1)
  modelStandard?: string;
}
