import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, registerDecorator, ValidateNested, ValidationOptions } from 'class-validator';

// Empty string is allowed through here and means "clear" (see UsersService#updateMe) -- only a
// non-empty value is checked against the runtime's IANA tz database. class-validator has no
// built-in IANA check, so Intl itself is the validator: an unrecognized zone throws.
function IsIanaTimeZoneOrEmpty(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimeZoneOrEmpty',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || value === '') return true;
          try {
            new Intl.DateTimeFormat(undefined, { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage() {
          return 'timeZone must be a valid IANA time zone identifier';
        },
      },
    });
  };
}

/** Text size steps of the Accessibility menu, in per cent (answer 2330: five steps, about 90 % to 150 %). */
export const TEXT_SIZES = [90, 100, 115, 130, 150] as const;

/**
 * The Accessibility menu's choices (answers 2330 to 2334). Every field is required, so a save always stores one whole,
 * known shape; an unknown field or a wrong value is a 400 (the global pipe forbids extra fields).
 */
export class AccessibilityPrefsDto {
  @IsIn(['normal', 'high'])
  contrast!: 'normal' | 'high';

  @IsIn(TEXT_SIZES as unknown as number[])
  textSize!: (typeof TEXT_SIZES)[number];

  @IsBoolean() textSpacing!: boolean;
  @IsBoolean() lineHeight!: boolean;
  @IsBoolean() bigCursor!: boolean;
  @IsBoolean() reduceMotion!: boolean;
  @IsBoolean() strongFocus!: boolean;
  @IsBoolean() underlineLinks!: boolean;
}

export class UpdateProfileDto {
  // Optional so a preferences-only PATCH ({timeZone, emailSignature}) doesn't need to resend the
  // current name just to pass validation -- but once sent, it still can't be blanked out.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @IsIanaTimeZoneOrEmpty()
  timeZone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  emailSignature?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AccessibilityPrefsDto)
  accessibility?: AccessibilityPrefsDto;
}
