import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateInvitationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  candidateIds!: string[];

  /**
   * Set only by "Advance to Next Round": the exam these candidates are being advanced FROM.
   * Stored on the new invitation so that exam's results table can report whether the invite
   * it triggered actually went out. Omitted by an ordinary bulk invite.
   */
  @IsOptional()
  @IsUUID()
  advancedFromExamId?: string;
}
