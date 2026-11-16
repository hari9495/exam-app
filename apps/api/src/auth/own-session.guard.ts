import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

/**
 * Settings S-10 security check (answer 1327): a change nobody may make while acting for someone else (impersonating, or
 * YukthiX staff acting in a company). The route-decorator form of `ownSession` for the older controllers.
 */
@Injectable()
export class OwnSessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user as { impersonatorUserId?: string; actingSuperAdmin?: boolean } | undefined;
    if (user?.impersonatorUserId || user?.actingSuperAdmin) throw new ForbiddenException('Not available while acting for someone else');
    return true;
  }
}

/**
 * Assessments AS-0 (answer 2006): on a controller, every change (anything but a read) is refused while acting for someone
 * else (impersonating, or YukthiX staff acting in a company); reads stay open.
 */
@Injectable()
export class OwnSessionChangesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest() as { method?: string; user?: { impersonatorUserId?: string; actingSuperAdmin?: boolean } };
    const reading = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
    if (!reading && (req.user?.impersonatorUserId || req.user?.actingSuperAdmin)) throw new ForbiddenException('Not available while acting for someone else');
    return true;
  }
}
