import { IsInt, Max, Min } from 'class-validator';

export class UpdateAccommodationDto {
  @IsInt()
  @Min(0)
  @Max(300)
  extraTimePercent!: number;
}
