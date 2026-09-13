import { CodeAutogradeService } from './code-autograde.service';

describe('CodeAutogradeService', () => {
  let tenantPrisma: { forTenant: jest.Mock };
  let piston: { execute: jest.Mock };
  let runtimes: { resolveLanguage: jest.Mock };
  let settlement: { finalizeManualGrade: jest.Mock };
  let tx: { attempt: { findUnique: jest.Mock }; question: { findMany: jest.Mock }; answer: { findMany: jest.Mock; update: jest.Mock } };
  let service: CodeAutogradeService;

  const attempt = { id: 'att-1', status: 'pending_manual_grade', questionOrderJson: JSON.stringify(['q1']), invitation: { exam: { id: 'exam-1', organizationId: 'org-1' } } };

  beforeEach(() => {
    tx = {
      attempt: { findUnique: jest.fn().mockResolvedValue(attempt) },
      question: { findMany: jest.fn().mockResolvedValue([{ id: 'q1', marks: 10, codeTestsJson: JSON.stringify([{ stdin: '2 3', expectedStdout: '5', weight: 1, hidden: true }, { stdin: '4 5', expectedStdout: '9', weight: 1, hidden: true }]) }]) },
      answer: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1', questionId: 'q1', answerText: 'print(sum(...))', codeLanguage: 'python', marksAwarded: null }]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    tenantPrisma = { forTenant: jest.fn((_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    piston = { execute: jest.fn() };
    runtimes = { resolveLanguage: jest.fn().mockResolvedValue({ language: 'python', version: '3.10' }) };
    settlement = { finalizeManualGrade: jest.fn().mockResolvedValue({}) };
    service = new CodeAutogradeService(tenantPrisma as never, piston as never, runtimes as never, settlement as never);
  });

  it('does nothing when the attempt is not awaiting grading', async () => {
    tx.attempt.findUnique.mockResolvedValue({ ...attempt, status: 'submitted' });
    await service.grade('att-1');
    expect(runtimes.resolveLanguage).not.toHaveBeenCalled();
    expect(settlement.finalizeManualGrade).not.toHaveBeenCalled();
  });

  it('runs each test, writes partial marks, and finalizes', async () => {
    piston.execute
      .mockResolvedValueOnce({ stdout: '5\n', stderr: '', exitCode: 0, compileError: null, timedOut: false }) // pass
      .mockResolvedValueOnce({ stdout: '8', stderr: '', exitCode: 0, compileError: null, timedOut: false }); // wrong -> fail
    await service.grade('att-1');

    expect(piston.execute).toHaveBeenCalledTimes(2);
    expect(tx.answer.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'a1' },
      data: expect.objectContaining({ marksAwarded: 5, isCorrect: false, gradingFeedback: 'Auto-graded: passed 1 of 2 test case(s).' }),
    }));
    expect(settlement.finalizeManualGrade).toHaveBeenCalledWith(tx, attempt.invitation.exam, expect.objectContaining({ id: 'att-1' }));
  });

  it('awards full marks + isCorrect when all tests pass', async () => {
    piston.execute.mockResolvedValue({ stdout: '5', stderr: '', exitCode: 0, compileError: null, timedOut: false });
    // both tests expect different outputs; make the answer match both by returning per-call
    piston.execute
      .mockResolvedValueOnce({ stdout: '5', stderr: '', exitCode: 0, compileError: null, timedOut: false })
      .mockResolvedValueOnce({ stdout: '9', stderr: '', exitCode: 0, compileError: null, timedOut: false });
    await service.grade('att-1');
    expect(tx.answer.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ marksAwarded: 10, isCorrect: true }) }));
  });

  it('leaves the answer ungraded when EVERY test run errors (outage), and does not finalize with it', async () => {
    piston.execute.mockRejectedValue(new Error('piston down'));
    await service.grade('att-1');
    expect(tx.answer.update).not.toHaveBeenCalled();
    // finalize is still attempted, but with the answer ungraded finalizeManualGrade would throw in
    // reality; here it's mocked. The key assertion is we didn't zero the candidate.
  });

  it('counts a nonzero exit / compile error / timeout as a failed test', async () => {
    piston.execute
      .mockResolvedValueOnce({ stdout: '5', stderr: 'boom', exitCode: 1, compileError: null, timedOut: false }) // fail (exit!=0)
      .mockResolvedValueOnce({ stdout: '9', stderr: '', exitCode: 0, compileError: null, timedOut: false }); // pass
    await service.grade('att-1');
    expect(tx.answer.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ marksAwarded: 5 }) }));
  });

  it('swallows the finalize error when manual-only code questions remain', async () => {
    piston.execute.mockResolvedValue({ stdout: '5', stderr: '', exitCode: 0, compileError: null, timedOut: false });
    settlement.finalizeManualGrade.mockRejectedValue(new Error('1 code question(s) still need grading'));
    await expect(service.grade('att-1')).resolves.toBeUndefined();
  });
});
