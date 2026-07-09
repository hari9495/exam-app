import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';

function secretsMatch(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedSecret = request.headers['x-internal-secret'];
    const expectedSecret = process.env.INTERNAL_SERVICE_SECRET;
    if (!expectedSecret || typeof providedSecret !== 'string' || !secretsMatch(providedSecret, expectedSecret)) {
      throw new UnauthorizedException('Invalid internal service credentials');
    }
    return true;
  }
}
