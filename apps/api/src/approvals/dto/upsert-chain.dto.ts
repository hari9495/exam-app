import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { APPROVER_TYPES } from '@exam-platform/shared';

class StepDto {
  @IsString() @IsNotEmpty() name!: string;
  @IsIn(APPROVER_TYPES) approverType!: string;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) approverUserIds?: string[];
  @IsOptional() @IsInt() @Min(1) managerLevel?: number;
}

export class UpsertChainDto {
  @IsBoolean() enabled!: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => StepDto) steps!: StepDto[];
}
