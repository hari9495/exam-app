import { IsIn } from 'class-validator';

export class RespondOfferDto {
  @IsIn(['accept', 'decline']) action!: 'accept' | 'decline';
}
