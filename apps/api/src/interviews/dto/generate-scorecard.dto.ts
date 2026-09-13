import { IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateScorecardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  notes!: string;
}
