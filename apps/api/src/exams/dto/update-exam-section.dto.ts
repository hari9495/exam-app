import { ArrayMinSize, IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';
import { CreateExamSectionDto } from './create-exam-section.dto';

export class UpdateExamSectionDto extends CreateExamSectionDto {
  // Overrides the REQUIRED title inherited from CreateExamSectionDto. This is a PATCH: a caller
  // editing one field (the weight input sends only weightPercent) must not be forced to resend
  // the title. Still rejected if present-but-blank -- clearing a section's name isn't a valid
  // edit. The service passes it to Prisma untouched, which treats undefined as "leave unchanged".
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsIn(['fixed', 'pool'])
  selectionMode?: string;

  @ValidateIf((o) => o.selectionMode === 'pool')
  @IsInt()
  @Min(1)
  poolSize?: number;

  @IsOptional()
  @IsIn(['easy', 'medium', 'hard'])
  poolDifficulty?: string;

  @ValidateIf((o) => o.selectionMode === 'pool')
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  poolTagIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  weightPercent?: number;

  // null clears the requirement (back to "every question must be answered"), so this is
  // ValidateIf-guarded rather than @IsOptional -- @IsOptional() would skip validation for an
  // explicit null too, but here null is a meaningful value we want to allow through untouched
  // while still rejecting 0, negatives and fractions.
  @ValidateIf((o) => o.requiredCount !== null && o.requiredCount !== undefined)
  @IsInt()
  @Min(1)
  requiredCount?: number | null;
}
