import { IsBoolean } from 'class-validator';

export class UpdateRecordVisibilityDto {
  @IsBoolean()
  enabled!: boolean;
}
