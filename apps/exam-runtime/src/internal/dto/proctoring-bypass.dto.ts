import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApplyProctoringBypassDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  @IsUUID()
  actorUserId!: string;
}

export class RevokeProctoringBypassDto {
  @IsUUID()
  actorUserId!: string;
}
