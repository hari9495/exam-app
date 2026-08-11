import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class FaceEnrolmentDto {
  // 'enrolled' carries an image; 'not_verified' records that capture failed and the exam's
  // policy let the candidate through anyway.
  @IsIn(['enrolled', 'not_verified'])
  status!: 'enrolled' | 'not_verified';

  // data: URI of the captured still. Absent for not_verified.
  @IsOptional() @IsString()
  snapshot?: string;

  // JSON of QualityMetrics, so a bad reference can be explained after the fact.
  @IsOptional() @IsString() @MaxLength(2000)
  qualityJson?: string;

  @IsBoolean()
  consentGiven!: boolean;
}
