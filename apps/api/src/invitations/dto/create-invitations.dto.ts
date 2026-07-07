import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateInvitationsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  candidateIds!: string[];
}
