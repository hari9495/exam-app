import { IsString, MaxLength, MinLength } from 'class-validator';

// Generic, bring-your-own embeddings provider (OpenAI-compatible /embeddings). All three required;
// the key is verified with a tiny embed call before it is stored.
export class UpdateEmbeddingConfigDto {
  @IsString()
  @MinLength(1)
  apiKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  baseUrl!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  model!: string;
}
