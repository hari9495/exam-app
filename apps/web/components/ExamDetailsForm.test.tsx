import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExamDetailsForm } from './ExamDetailsForm';

jest.mock('../lib/auth-context', () => ({ useAuth: () => ({ accessToken: 'test-token', organizationSlug: 'acme' }) }));

describe('ExamDetailsForm', () => {
  it('submits title, duration, and pass criteria', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create exam" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Backend Round');
    await userEvent.clear(screen.getByLabelText('Duration (Minutes)'));
    await userEvent.type(screen.getByLabelText('Duration (Minutes)'), '45');
    await userEvent.click(screen.getByRole('button', { name: 'Create exam' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Backend Round', durationMinutes: 45 }),
    );
  });

  it('submits schedulingEnabled and both window datetimes when scheduling is turned on', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Scheduled Exam');
    await userEvent.click(screen.getByLabelText('Enable Scheduling'));
    const startInput = screen.getByLabelText('Window Opens') as HTMLInputElement;
    const endInput = screen.getByLabelText('Window Closes') as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '2026-07-20T09:00' } });
    fireEvent.change(endInput, { target: { value: '2026-07-27T18:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        schedulingEnabled: true,
        availabilityWindowStart: new Date('2026-07-20T09:00').toISOString(),
        availabilityWindowEnd: new Date('2026-07-27T18:00').toISOString(),
      }),
    );
  });

  it('shows a validation error and does not submit when scheduling is on but a window field is missing', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Bad Exam');
    await userEvent.click(screen.getByLabelText('Enable Scheduling'));
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('Both a window open and close time are required.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows a validation error and does not submit when the window close time is not after the open time', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Backwards Window Exam');
    await userEvent.click(screen.getByLabelText('Enable Scheduling'));
    const startInput = screen.getByLabelText('Window Opens') as HTMLInputElement;
    const endInput = screen.getByLabelText('Window Closes') as HTMLInputElement;
    fireEvent.change(startInput, { target: { value: '2026-07-27T18:00' } });
    fireEvent.change(endInput, { target: { value: '2026-07-20T09:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.getByText('The window close time must be after its open time.')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not include scheduling window fields when scheduling is off', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

    await userEvent.type(screen.getByLabelText('Title'), 'Normal Exam');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedulingEnabled: false }));
    const call = onSubmit.mock.calls[0][0];
    expect(call.availabilityWindowStart).toBeUndefined();
    expect(call.availabilityWindowEnd).toBeUndefined();
  });

  it('pre-fills the window inputs from an existing scheduled exam', () => {
    const scheduledExam = {
      id: 'exam-1', title: 'Existing', instructions: null, status: 'draft' as const, durationMinutes: 60,
      passCriteriaPercent: 40, randomizeOrder: false, feedbackVisibility: 'pass_fail' as const, schedulingEnabled: true,
      availabilityWindowStart: '2026-07-20T09:00:00.000Z', availabilityWindowEnd: '2026-07-27T18:00:00.000Z',
      walkInEnabled: false, walkInListed: true, allowedIpRange: null, createdAt: '2026-07-01T00:00:00.000Z', sections: [], invitationCount: 0,
      hasStartedAttempts: false, requiresManualGrading: false,
      enableAntiCheating: true, webcamProctoringEnabled: true, webcamRecordOnly: false, proctoringEnforcement: 'block' as const, proctoringStrikeLimit: 3,
      disabledProctoringSignalsJson: null, screenCaptureEnabled: false, lockdownRequired: false,
      faceVerificationEnabled: false, faceEnrolmentPolicy: 'retry_then_allow' as const,
    };
    render(<ExamDetailsForm initialExam={scheduledExam} onSubmit={jest.fn()} submitLabel="Save" />);

    // Derived the same way the component derives it (local date/time components from the ISO
    // string), rather than hardcoding a UTC-only expectation — this suite runs outside UTC.
    const expected = new Date(scheduledExam.availabilityWindowStart);
    const pad = (n: number) => String(n).padStart(2, '0');
    const expectedValue = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}T${pad(expected.getHours())}:${pad(expected.getMinutes())}`;

    expect(screen.getByLabelText('Enable Scheduling')).toBeChecked();
    expect(screen.getByLabelText('Window Opens')).toHaveValue(expectedValue);
  });

  it('includes feedbackVisibility in the submitted value, defaulting to pass_fail for a new exam', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feedbackVisibility: 'pass_fail' }));
  });

  it('lets the recruiter change the candidate feedback level', async () => {
    const onSubmit = jest.fn();
    render(
      <ExamDetailsForm
        initialExam={{ title: 'Exam', durationMinutes: 60, passCriteriaPercent: 40, randomizeOrder: false, feedbackVisibility: 'pass_fail', schedulingEnabled: false } as any}
        onSubmit={onSubmit}
        submitLabel="Save details"
      />,
    );

    await userEvent.click(screen.getByRole('combobox', { name: /candidate feedback/i }));
    await userEvent.click(screen.getByRole('option', { name: /score/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ feedbackVisibility: 'score' }));
  });

  it('includes walkInEnabled in the submitted value, defaulting to false for a new exam', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ walkInEnabled: false }));
  });

  it('lets the recruiter enable walk-in registration', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByLabelText('Enable Walk-In Registration For This Exam'));
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ walkInEnabled: true }));
  });

  it('hides the "show in shared list" toggle until walk-in itself is enabled', async () => {
    render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Save details" />);

    expect(screen.queryByLabelText('Show In The Shared Walk-In Exam List')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Enable Walk-In Registration For This Exam'));

    expect(screen.getByLabelText('Show In The Shared Walk-In Exam List')).toBeInTheDocument();
  });

  it('defaults walkInListed to true and submits it alongside walkInEnabled', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByLabelText('Enable Walk-In Registration For This Exam'));
    expect(screen.getByLabelText('Show In The Shared Walk-In Exam List')).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ walkInEnabled: true, walkInListed: true }));
  });

  it('lets the recruiter hide this exam from the shared walk-in list while keeping walk-in enabled', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save details" />);

    await userEvent.type(screen.getByLabelText('Title'), 'New Exam');
    await userEvent.click(screen.getByLabelText('Enable Walk-In Registration For This Exam'));
    await userEvent.click(screen.getByLabelText('Show In The Shared Walk-In Exam List'));
    await userEvent.click(screen.getByRole('button', { name: 'Save details' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ walkInEnabled: true, walkInListed: false }));
  });

  it('submits a trimmed allowedIpRange and omits it when blank', async () => {
    const onSubmit = jest.fn();
    render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Save" />);
    await userEvent.type(screen.getByLabelText(/allowed ip \/ cidr range/i), '  203.0.113.0/24  ');
    await userEvent.type(screen.getByLabelText('Title'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ allowedIpRange: '203.0.113.0/24' }));
  });

  it('prefills allowedIpRange from initialExam and sends null when cleared', async () => {
    const onSubmit = jest.fn();
    const examWithIpRange = {
      id: 'exam-1', title: 'Existing', instructions: null, status: 'draft' as const, durationMinutes: 60,
      passCriteriaPercent: 40, randomizeOrder: false, feedbackVisibility: 'pass_fail' as const, schedulingEnabled: false,
      availabilityWindowStart: null, availabilityWindowEnd: null, walkInEnabled: false, walkInListed: true,
      allowedIpRange: '203.0.113.0/24', createdAt: '2026-07-01T00:00:00.000Z', sections: [], invitationCount: 0,
      hasStartedAttempts: false, requiresManualGrading: false,
      enableAntiCheating: true, webcamProctoringEnabled: true, webcamRecordOnly: false, proctoringEnforcement: 'block' as const, proctoringStrikeLimit: 3,
      disabledProctoringSignalsJson: null, screenCaptureEnabled: false, lockdownRequired: false,
      faceVerificationEnabled: false, faceEnrolmentPolicy: 'retry_then_allow' as const,
    };
    render(<ExamDetailsForm initialExam={examWithIpRange} onSubmit={onSubmit} submitLabel="Save" />);

    const ipInput = screen.getByLabelText(/allowed ip \/ cidr range/i);
    expect(ipInput).toHaveValue('203.0.113.0/24');

    await userEvent.clear(ipInput);
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ allowedIpRange: null }));
  });

  describe('anti-cheating master switch', () => {
    it('defaults to on for a new exam, with every dependent control visible', () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Create" />);

      expect(screen.getByLabelText('Enable Anti-Cheating Monitoring For This Exam')).toBeChecked();
      expect(screen.getByLabelText('Require Webcam Proctoring')).toBeInTheDocument();
      expect(screen.getByText('If a rule is broken')).toBeInTheDocument();
      expect(screen.getByLabelText('Switching browser tabs')).toBeInTheDocument();
      expect(screen.getByLabelText("Record The Candidate's Screen As Evidence")).toBeInTheDocument();
      expect(screen.getByLabelText('Require Safe Exam Browser (Lockdown)')).toBeInTheDocument();
    });

    it('hides every dependent control when the master switch is turned off', async () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Create" />);

      await userEvent.click(screen.getByLabelText('Enable Anti-Cheating Monitoring For This Exam'));

      expect(screen.queryByLabelText('Require Webcam Proctoring')).not.toBeInTheDocument();
      expect(screen.queryByText('If a rule is broken')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Switching browser tabs')).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Record The Candidate's Screen As Evidence")).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Require Safe Exam Browser (Lockdown)')).not.toBeInTheDocument();
    });

    it('restores the dependent controls, with prior choices intact, when turned back on', async () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Create" />);

      await userEvent.click(screen.getByLabelText('Right-click / context menu'));
      const masterSwitch = screen.getByLabelText('Enable Anti-Cheating Monitoring For This Exam');
      await userEvent.click(masterSwitch);
      await userEvent.click(masterSwitch);

      expect(screen.getByLabelText('Right-click / context menu')).not.toBeChecked();
      expect(screen.getByLabelText('Switching browser tabs')).toBeChecked();
    });

    it('submits enableAntiCheating alongside the rest of the form', async () => {
      const onSubmit = jest.fn();
      render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

      await userEvent.type(screen.getByLabelText('Title'), 'Screen');
      await userEvent.click(screen.getByLabelText('Enable Anti-Cheating Monitoring For This Exam'));
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ enableAntiCheating: false }));
    });
  });

  describe('proctoring settings', () => {
    it("submits today's defaults when the recruiter changes nothing", async () => {
      const onSubmit = jest.fn();
      render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

      await userEvent.type(screen.getByLabelText('Title'), 'Screen');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          webcamProctoringEnabled: true,
          proctoringEnforcement: 'block',
          proctoringStrikeLimit: 3,
          disabledProctoringSignals: [],
        }),
      );
    });

    it('submits webcam off and the signals the recruiter unticked', async () => {
      const onSubmit = jest.fn();
      render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

      await userEvent.type(screen.getByLabelText('Title'), 'Screen');
      await userEvent.click(screen.getByLabelText('Require Webcam Proctoring'));
      await userEvent.click(screen.getByLabelText('Right-click / context menu'));
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ webcamProctoringEnabled: false, disabledProctoringSignals: ['right_click'] }),
      );
    });

    it("submits webcamRecordOnly=false by default, so today's exams keep pausing/blocking on webcam violations", async () => {
      const onSubmit = jest.fn();
      render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

      await userEvent.type(screen.getByLabelText('Title'), 'Screen');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ webcamRecordOnly: false }));
    });

    it('lets webcam violations be recorded without pausing/blocking, independent of the "If a rule is broken" setting', async () => {
      const onSubmit = jest.fn();
      render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

      await userEvent.type(screen.getByLabelText('Title'), 'Screen');
      await userEvent.click(screen.getByLabelText('Record Only — Never Pause For Webcam Violations'));
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ webcamRecordOnly: true, proctoringEnforcement: 'block' }),
      );
    });

    it('hides the webcam record-only option when webcam proctoring itself is off', async () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Create" />);

      await userEvent.click(screen.getByLabelText('Require Webcam Proctoring'));

      expect(screen.queryByLabelText('Record Only — Never Pause For Webcam Violations')).not.toBeInTheDocument();
    });

    it('prefills webcamRecordOnly from an existing exam', () => {
      const examWithRecordOnlyWebcam = {
        id: 'exam-1', title: 'Existing', instructions: null, status: 'draft' as const, durationMinutes: 60,
        passCriteriaPercent: 40, randomizeOrder: false, feedbackVisibility: 'pass_fail' as const, schedulingEnabled: false,
        availabilityWindowStart: null, availabilityWindowEnd: null, walkInEnabled: false, walkInListed: true,
        allowedIpRange: null, createdAt: '2026-07-01T00:00:00.000Z', sections: [], invitationCount: 0,
        hasStartedAttempts: false, requiresManualGrading: false,
        enableAntiCheating: true, webcamProctoringEnabled: true, webcamRecordOnly: true, proctoringEnforcement: 'block' as const,
        proctoringStrikeLimit: 3, disabledProctoringSignalsJson: null, screenCaptureEnabled: false, lockdownRequired: false,
        faceVerificationEnabled: false, faceEnrolmentPolicy: 'retry_then_allow' as const,
      };
      render(<ExamDetailsForm initialExam={examWithRecordOnlyWebcam} onSubmit={jest.fn()} submitLabel="Save" />);

      expect(screen.getByLabelText('Record Only — Never Pause For Webcam Violations')).toBeChecked();
    });

    it('hides the strike limit in record-only mode, because nothing is ever blocked', async () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Create" />);

      expect(screen.getByLabelText('Block After')).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText('Record Only — Never Pause The Exam'));

      expect(screen.queryByLabelText('Block After')).not.toBeInTheDocument();
    });

    it('prefills from an existing exam, reading the stored disabled-signal JSON', () => {
      render(
        <ExamDetailsForm
          onSubmit={jest.fn()}
          submitLabel="Save"
          initialExam={
            {
              title: 'Screen',
              durationMinutes: 60,
              passCriteriaPercent: 40,
              randomizeOrder: false,
              feedbackVisibility: 'pass_fail',
              schedulingEnabled: false,
              walkInEnabled: false,
              webcamProctoringEnabled: false,
              proctoringEnforcement: 'warn',
              proctoringStrikeLimit: 5,
              disabledProctoringSignalsJson: JSON.stringify(['right_click']),
            } as never
          }
        />,
      );

      expect(screen.getByLabelText('Require Webcam Proctoring')).not.toBeChecked();
      expect(screen.getByLabelText('Record Only — Never Pause The Exam')).toBeChecked();
    });

    it('disables every proctoring control once the exam is locked, and says why', () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Save" locked />);

      expect(screen.getByLabelText('Require Webcam Proctoring')).toBeDisabled();
      // Disabled via the enclosing <fieldset disabled>, same as every other proctoring
      // control -- asserted explicitly here rather than just assumed.
      expect(screen.getByLabelText("Record The Candidate's Screen As Evidence")).toBeDisabled();
      expect(screen.getByText(/locked because a candidate has already started it/i)).toBeInTheDocument();
    });
  });

  describe('screen capture toggle', () => {
    it('submits screenCaptureEnabled false by default', async () => {
      const onSubmit = jest.fn();
      render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

      await userEvent.type(screen.getByLabelText('Title'), 'Screen');
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ screenCaptureEnabled: false }));
    });

    it('submits screenCaptureEnabled true when ticked', async () => {
      const onSubmit = jest.fn();
      render(<ExamDetailsForm onSubmit={onSubmit} submitLabel="Create" />);

      await userEvent.type(screen.getByLabelText('Title'), 'Screen');
      await userEvent.click(screen.getByLabelText("Record The Candidate's Screen As Evidence"));
      await userEvent.click(screen.getByRole('button', { name: 'Create' }));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ screenCaptureEnabled: true }));
    });

    it('shows the explanatory copy only once ticked', async () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Create" />);

      expect(screen.queryByText(/must share their whole screen to start/i)).not.toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Record The Candidate's Screen As Evidence"));

      expect(screen.getByText(/must share their whole screen to start/i)).toBeInTheDocument();
    });
  });

  describe('full-exam lock', () => {
    it('disables every field in the form, not just proctoring, once the exam is locked', () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Save" locked />);

      expect(screen.getByLabelText('Title')).toBeDisabled();
      expect(screen.getByLabelText('Duration (Minutes)')).toBeDisabled();
      expect(screen.getByLabelText('Enable Walk-In Registration For This Exam')).toBeDisabled();
      expect(screen.getByLabelText(/allowed ip \/ cidr range/i)).toBeDisabled();
    });

    it('disables the "show in shared list" toggle too, when walk-in was already enabled', () => {
      render(
        <ExamDetailsForm
          onSubmit={jest.fn()}
          submitLabel="Save"
          locked
          initialExam={{ title: 'Exam', durationMinutes: 60, passCriteriaPercent: 40, walkInEnabled: true, walkInListed: true } as never}
        />,
      );

      expect(screen.getByLabelText('Show In The Shared Walk-In Exam List')).toBeDisabled();
    });

    it('hides the submit button entirely once the exam is locked, since there is nothing left to save', () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Save" locked />);

      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    });

    it('shows the submit button and leaves fields editable when the exam is not locked', () => {
      render(<ExamDetailsForm onSubmit={jest.fn()} submitLabel="Save" />);

      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
      expect(screen.getByLabelText('Title')).not.toBeDisabled();
    });

    it('shows a caller-supplied lockedMessage instead of the default, for the published-not-started reason', () => {
      render(
        <ExamDetailsForm
          onSubmit={jest.fn()}
          submitLabel="Save"
          locked
          lockedMessage="This exam is published, so its details are locked. Click Unpublish above to make changes."
        />,
      );

      expect(screen.getByText(/published, so its details are locked/i)).toBeInTheDocument();
      expect(screen.queryByText(/candidate has already started it/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText('Title')).toBeDisabled();
    });
  });
});
