import { registerDecorator, ValidationOptions, IsDefined } from 'class-validator';
import { WEEKDAYS, BusinessHours, Holiday } from '@exam-platform/shared';

const TIME_RE = /^\d{2}:\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidTimeZone(timeZone: unknown): boolean {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    // eslint-disable-next-line no-new
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

// evaluateSlot (packages/shared/src/scheduling/business-hours.ts) indexes
// businessHours.days[weekday] for every weekday unconditionally -- a partial
// week would throw at evaluation time, so all 7 keys are required here, not optional.
function isValidBusinessHours(value: unknown): value is BusinessHours {
  if (!value || typeof value !== 'object') return false;
  const bh = value as Record<string, unknown>;
  if (!isValidTimeZone(bh.timeZone)) return false;
  if (!bh.days || typeof bh.days !== 'object') return false;
  const days = bh.days as Record<string, unknown>;
  const keys = Object.keys(days);
  if (keys.length !== WEEKDAYS.length || !WEEKDAYS.every((day) => keys.includes(day))) return false;
  return WEEKDAYS.every((day) => {
    const d = days[day] as Record<string, unknown> | undefined;
    if (!d || typeof d.enabled !== 'boolean') return false;
    if (typeof d.open !== 'string' || !TIME_RE.test(d.open)) return false;
    if (typeof d.close !== 'string' || !TIME_RE.test(d.close)) return false;
    if (d.enabled && !(d.open < d.close)) return false;
    return true;
  });
}

function isValidHoliday(value: unknown): value is Holiday {
  if (!value || typeof value !== 'object') return false;
  const h = value as Record<string, unknown>;
  return (
    typeof h.date === 'string' &&
    DATE_RE.test(h.date) &&
    typeof h.name === 'string' &&
    h.name.length > 0 &&
    h.name.length <= 120
  );
}

function IsBusinessHours(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBusinessHours',
      target: object.constructor,
      propertyName,
      options: {
        message:
          'businessHours must have a valid IANA timeZone and all 7 weekdays (mon..sun) with open/close as "HH:MM" and open before close when enabled',
        ...validationOptions,
      },
      validator: { validate: isValidBusinessHours },
    });
  };
}

function IsHolidaysArray(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isHolidaysArray',
      target: object.constructor,
      propertyName,
      options: {
        message: 'holidays must be an array of at most 100 entries, each { date: "YYYY-MM-DD", name: non-empty string up to 120 chars }',
        ...validationOptions,
      },
      validator: {
        validate: (value: unknown) => Array.isArray(value) && value.length <= 100 && value.every(isValidHoliday),
      },
    });
  };
}

export class UpdateBusinessHoursDto {
  @IsDefined()
  @IsBusinessHours()
  businessHours!: BusinessHours;

  @IsDefined()
  @IsHolidaysArray()
  holidays!: Holiday[];
}
