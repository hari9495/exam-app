import { IsArray, IsString } from 'class-validator';

export class SetWalkInGroupExamsDto {
  @IsArray()
  @IsString({ each: true })
  examIds!: string[];
}
