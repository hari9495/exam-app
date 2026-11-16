import { PrismaClient } from '@prisma/client';
import type { Response } from 'supertest';

// Answer 2141: POST /questions makes a draft that another person approves in the question bank before any test can use
// it. Suites about something else (tests, attempts, grading, proctoring) need usable questions: this approves the draft
// just created, as a reviewer would (status active, approved now). The review itself is covered by
// question-bank-review.e2e-spec.ts; suites that test the draft rule itself never call this.
let owner: PrismaClient | null = null;

export async function approveQuestion(id: string): Promise<void> {
  owner ??= new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
  await owner.$transaction([
    owner.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'on', true)`),
    owner.$executeRawUnsafe(`UPDATE questions SET status = 'active', last_approved_at = now() WHERE id = $1::uuid AND status = 'draft'`, id),
  ]);
}

/** Wraps a `POST /questions` response: approves the new question and returns the response as an approved one. */
export async function asApproved(res: Response): Promise<Response> {
  await approveQuestion((res.body as { id: string }).id);
  (res.body as { status: string }).status = 'active';
  return res;
}

afterAll(async () => {
  await owner?.$disconnect();
  owner = null;
});

/** For the suites that test the draft rules themselves: puts a question back to a draft never approved. */
export async function makeDraft(id: string): Promise<void> {
  owner ??= new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
  await owner.$transaction([
    owner.$executeRawUnsafe(`SELECT set_config('app.is_super_admin', 'on', true)`),
    owner.$executeRawUnsafe(`UPDATE questions SET status = 'draft', last_approved_at = NULL WHERE id = $1::uuid`, id),
  ]);
}
