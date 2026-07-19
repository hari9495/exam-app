import { IsUrl } from 'class-validator';

export class UpdateWebhookUrlDto {
  @IsUrl({ require_protocol: true })
  url!: string;
}
