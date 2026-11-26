import { BadRequestException, ConflictException } from '@nestjs/common';
import { CompanyContext, Tx } from '../org-structure/org-structure.service';
import { asDate, iso } from './learning-core';
import { SEAT_STATUSES, placeIn } from './session-rules';

/**
 * A place in a session for one more person (LRN-06): a seat while one is free, else the waitlist, first come first
 * served. Serialised per session, so two people never take the last seat. The due date is the first slot's day.
 */
export async function placeInSession(tx: Tx, c: CompanyContext, sessionId: string, courseId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`learning-session:${sessionId}`}))`;
  const s = await tx.learningSession.findFirst({ where: { organizationId: c.organizationId, id: sessionId, courseId, status: 'scheduled' } });
  if (!s) throw new BadRequestException('Choose a scheduled session of this course.');
  const first = await tx.learningSessionSlot.findFirst({ where: { organizationId: c.organizationId, sessionId }, orderBy: { position: 'asc' } });
  if (first && first.startsAt.getTime() < Date.now()) throw new ConflictException('This session has started. Choose a later one.');
  const taken = await tx.learningEnrolment.count({ where: { organizationId: c.organizationId, sessionId, status: { in: [...SEAT_STATUSES] } } });
  const status = placeIn(taken, s.seats);
  return { status, waitlistedAt: status === 'waitlisted' ? new Date() : null, dueOn: first ? asDate(iso(first.startsAt)!) : null };
}
