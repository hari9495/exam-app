import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Matches, ValidateNested } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A seat's values; the service checks them in full (masters usable in the entity, no supervisor loop). */
export class SeatValuesDto {
  @IsOptional() @IsString() @Length(2, 120) title?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() designationId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) gradeIds?: string[];
  @IsOptional() @IsUUID() defaultGradeId?: string | null;
  @IsOptional() @IsNumber() fte?: number;
  @IsOptional() @IsNumber() headcount?: number;
  @IsOptional() @IsUUID() supervisorPositionId?: string | null;
  @IsOptional() @IsUUID() costCentreId?: string | null;
  @IsOptional() @IsNumber() entrySalary?: number | null;
  @IsOptional() @IsIn(['proposed', 'active']) status?: 'proposed' | 'active';
}

export class PositionChangeItemDto {
  @IsIn(['create', 'change', 'freeze', 'activate', 'eliminate']) kind!: 'create' | 'change' | 'freeze' | 'activate' | 'eliminate';
  @IsOptional() @IsUUID() positionId?: string;
  @IsOptional() @IsUUID() legalEntityId?: string;
  @Matches(DAY) effectiveOn!: string;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => SeatValuesDto) values?: SeatValuesDto;
}

export class PositionChangesDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => PositionChangeItemDto) items!: PositionChangeItemDto[];
  @IsString() @Length(10, 500) reason!: string;
}

export class PositionsQueryDto {
  @IsOptional() @Matches(DAY) asOf?: string;
  @IsOptional() @IsIn(['proposed', 'active', 'frozen', 'eliminated']) status?: string;
  @IsOptional() @IsUUID() legalEntityId?: string;
  @IsOptional() @IsString() @Length(0, 80) q?: string;
}

export class PositionAsOfDto {
  @IsOptional() @Matches(DAY) asOf?: string;
}

export class ReasonDto {
  @IsString() @Length(10, 500) reason!: string;
}
