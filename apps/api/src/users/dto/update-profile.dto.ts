import { IsNotEmpty, IsOptional, IsString, MaxLength, registerDecorator, ValidationOptions } from 'class-validator';

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

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @IsIanaTimeZoneOrEmpty()
  timeZone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  emailSignature?: string;
}
