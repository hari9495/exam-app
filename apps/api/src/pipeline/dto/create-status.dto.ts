import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateStatusDto {
  @IsString() @IsNotEmpty() @MaxLength(200) name!: string;
  @IsInt() @Min(0) position!: number;
}
