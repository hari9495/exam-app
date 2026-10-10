import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, Min } from 'class-validator';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class DocumentRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  personIds!: string[];

  @Matches(/^[a-z][a-z0-9_]{1,39}$/)
  typeKey!: string;
}

export class DocumentUploadDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  expiresOn?: string;
}

export class DocumentDecisionDto {
  @IsIn(['verify', 'reject'])
  decision!: 'verify' | 'reject';

  @IsOptional()
  @trim()
  @IsString()
  @Length(0, 500)
  reason?: string;

  @IsInt()
  version!: number;
}

export class DocumentFileQueryDto {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  version?: number;
}

export class PersonDocsParamDto {
  @IsString()
  @MaxLength(40)
  typeKey!: string;
}
