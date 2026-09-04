import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreatePipelineDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
}
