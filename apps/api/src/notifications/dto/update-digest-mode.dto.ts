import { IsIn } from 'class-validator';

export class UpdateDigestModeDto {
  @IsIn(['immediate', 'daily', 'off'])
  mode!: string;
}
