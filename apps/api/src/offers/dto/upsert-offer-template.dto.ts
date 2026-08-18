import { IsString } from 'class-validator';

export class UpsertOfferTemplateDto {
  @IsString() subject!: string;
  @IsString() body!: string;
}
