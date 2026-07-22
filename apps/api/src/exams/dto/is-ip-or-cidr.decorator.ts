import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidIpRange } from '@exam-platform/shared';

export function IsIpOrCidr(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIpOrCidr',
      target: object.constructor,
      propertyName,
      options: {
        message: `${propertyName} must be a valid IP address or CIDR range (e.g. 203.0.113.4 or 203.0.113.0/24)`,
        ...validationOptions,
      },
      validator: {
        // '' is allowed alongside valid ranges: it's how a cleared form field round-trips
        // (service layer maps '' -> null to mean "no restriction").
        validate(value: unknown): boolean {
          return value === '' || (typeof value === 'string' && isValidIpRange(value));
        },
      },
    });
  };
}
