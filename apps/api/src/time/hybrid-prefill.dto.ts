import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsUUID, Matches, ValidateNested } from 'class-validator';
import { TOOL_PROVIDERS, type ToolProvider } from './providers/work-tools';

// TIM-41 hybrid office days and TIM-43 timesheet suggestions: inputs, checked here and again in the services.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MSG = { message: 'Give the date as yyyy-mm-dd.' };

export class WeekQueryDto {
  @IsOptional()
  @Matches(DATE, DATE_MSG)
  week?: string;
}

class PlanDayDto {
  @Matches(DATE, DATE_MSG)
  on!: string;

  @IsIn(['office', 'home'], { message: 'Choose office or home.' })
  place!: 'office' | 'home';
}

export class PlanDto {
  /** Someone in the manager's team (or roster.manage in scope); omitted: the signed-in person. */
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Pick at least one day.' })
  @ArrayMaxSize(10, { message: 'Plan at most two weeks at a time.' })
  @ValidateNested({ each: true })
  @Type(() => PlanDayDto)
  days!: PlanDayDto[];
}

export class RemindDto {
  @IsUUID()
  employeeId!: string;

  /** Monday of the week to plan (this week or next). */
  @Matches(DATE, DATE_MSG)
  week!: string;
}

export class ProviderParamDto {
  @IsIn(TOOL_PROVIDERS as unknown as string[], { message: 'Choose the work calendar, the issue tracker or the code host.' })
  provider!: ToolProvider;
}
