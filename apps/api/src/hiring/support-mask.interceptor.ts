import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

// M10 AT1 (founder D14): in a YukthiX support session, candidate contact details in hiring responses are masked. Hiring
// decisions (offers, feedback, referrals) are already refused by the database (support_session_excluded). Staff
// controllers of the hiring product only; candidate-facing public pages never run in a support session.
export const HIRING_CONTROLLERS = new Set([
  'CandidatesController', 'PipelineController', 'InterviewsController', 'InterviewAiController', 'OffersController', 'ReferralsController',
  'AgenciesController', 'AgencySubmissionsController', 'CandidateSearchController', 'CandidateEmailsController', 'CandidateSmsController',
  'CandidateWhatsappController', 'BulkCandidateEmailController', 'CandidateFitController', 'InternalApplicationsController', 'WalkInController', 'DrivesController',
]);
const CONTACT = /^(email|phone|candidateEmail|candidatePhone|phoneE164)$/;

export function maskContact(key: string, value: string): string {
  if (key.toLowerCase().includes('email')) {
    const at = value.indexOf('@');
    return at > 0 ? `${value[0]}•••${value.slice(at)}` : '•••';
  }
  const digits = value.replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••';
}

export function maskDeep(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => maskDeep(v, depth + 1));
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = typeof v === 'string' && CONTACT.test(k) ? maskContact(k, v) : maskDeep(v, depth + 1);
  return out;
}

@Injectable()
export class SupportMaskInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ user?: { supportSessionId?: string | null } }>();
    if (!req?.user?.supportSessionId || !HIRING_CONTROLLERS.has(context.getClass().name)) return next.handle();
    return next.handle().pipe(map((body) => maskDeep(body)));
  }
}
