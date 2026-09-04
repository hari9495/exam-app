import { IsBoolean, IsString } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsString() type!: string;
  @IsBoolean() emailEnabled!: boolean;
}
