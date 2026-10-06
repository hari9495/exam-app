import { IsString, MaxLength, MinLength } from 'class-validator';
import { TENANT_SECURITY_FLOOR } from '@exam-platform/shared';

export class ResetPasswordDto {
  @IsString()
  token!: string;

  @IsString()
  @MinLength(TENANT_SECURITY_FLOOR.passwordMinLength)
  @MaxLength(TENANT_SECURITY_FLOOR.passwordMaxLength)
  newPassword!: string;
}
