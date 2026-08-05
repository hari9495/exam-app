import { IsNotEmpty, IsString } from 'class-validator';

export class RenameWalkInGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
