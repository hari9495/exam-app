import { IsString } from 'class-validator';

export class RedeemInvitationDto {
  @IsString()
  token!: string;
}
