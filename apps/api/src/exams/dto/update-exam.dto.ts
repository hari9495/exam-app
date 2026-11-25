import { IsBoolean, IsOptional } from 'class-validator';
import { CreateExamDto } from './create-exam.dto';

export class UpdateExamDto extends CreateExamDto {
  /** AS-6 part 2 (answer 2272): candidates may use the approved assistant in the runner (the builder sets it). */
  @IsOptional()
  @IsBoolean()
  aiAllowed?: boolean;
}
