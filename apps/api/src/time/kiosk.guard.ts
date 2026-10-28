import { CanActivate, ExecutionContext, Injectable, createParamDecorator } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { KioskService, type Kiosk } from './kiosk.service';

/** The kiosk's secret travels in this header (never in a URL). */
export const KIOSK_HEADER = 'x-kiosk-token';
const header = (req: Request) => {
  const v = req.headers[KIOSK_HEADER];
  return typeof v === 'string' ? v : undefined;
};

/** A kiosk route: the token must belong to a kiosk in use (unknown, reset or revoked: 401). */
@Injectable()
export class KioskGuard implements CanActivate {
  constructor(private readonly kiosks: KioskService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { kiosk?: Kiosk }>();
    req.kiosk = await this.kiosks.authenticate(header(req));
    return true;
  }
}

/**
 * Kiosk routes are limited per kiosk (many tablets may share one site's internet address), keyed by a hash of the
 * kiosk's token before any database work; calls without one (set-up) are limited per address. Fails closed.
 */
@Injectable()
export class KioskThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const t = header(req as Request);
    return t ? `kiosk:${createHash('sha256').update(t).digest('hex').slice(0, 32)}` : `kiosk-ip:${req.ip}`;
  }
}

export const CurrentKiosk = createParamDecorator((_: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<{ kiosk: Kiosk }>().kiosk);
