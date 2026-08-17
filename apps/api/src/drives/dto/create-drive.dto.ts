import { IsISO8601, IsString, MinLength, MaxLength } from 'class-validator';

export class CreateDriveDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsISO8601()
  startsAt!: string;

  @IsISO8601()
  endsAt!: string;
}
