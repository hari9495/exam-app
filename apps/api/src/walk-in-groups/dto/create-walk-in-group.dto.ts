import { IsNotEmpty, IsString } from 'class-validator';

export class CreateWalkInGroupDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}
