import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

// Shared compose fields. subject/body are always sent (the web resolves a picked template into them,
// exactly like the single-send SendMessageModal); templateId is recorded/passed through only.
class BulkEmailComposeDto {
  @IsOptional()
  @IsString()
  templateId?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  subject!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;

  @IsOptional()
  @IsUUID('all')
  senderAddressId?: string;
}

export class SendBulkByEntriesDto extends BulkEmailComposeDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  entryIds!: string[];
}

export class SendBulkByCandidatesDto extends BulkEmailComposeDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  candidateIds!: string[];
}
