import { IsNotEmpty, IsString } from 'class-validator';

export class CreateExamSectionDto {
  @IsString()
  @IsNotEmpty()
  title!: string;
}
