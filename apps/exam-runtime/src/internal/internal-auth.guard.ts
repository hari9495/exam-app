import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedSecret = request.headers['x-internal-secret'];
    if (!process.env.INTERNAL_SERVICE_SECRET || providedSecret !== process.env.INTERNAL_SERVICE_SECRET) {
      throw new UnauthorizedException('Invalid internal service credentials');
    }
    return true;
  }
}
