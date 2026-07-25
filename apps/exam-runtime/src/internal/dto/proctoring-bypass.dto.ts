import { IsNotEmpty, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class ApplyProctoringBypassDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  @Matches(/\S/, { message: 'reason must contain at least one non-whitespace character' })
  reason!: string;

  @IsUUID()
  actorUserId!: string;
}

export class RevokeProctoringBypassDto {
  @IsUUID()
  actorUserId!: string;
}
