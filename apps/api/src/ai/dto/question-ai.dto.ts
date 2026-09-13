import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SuggestTagsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  options?: string[];
}

export class GenerateDistractorsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  stem!: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  correctAnswers!: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  count?: number;
}
