import { render, screen } from '@testing-library/react';
import { ProctoringWarningOverlay, ProctoringBlockOverlay } from './ProctoringOverlay';

describe('ProctoringWarningOverlay', () => {
  const noop = () => undefined;

  it('shows the multiple_faces message', () => {
    render(<ProctoringWarningOverlay strike={1} reason="multiple_faces" strikeLimit={3} onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText('More Than One Person Detected')).toBeInTheDocument();
  });

  it('shows the no_face message', () => {
    render(<ProctoringWarningOverlay strike={1} reason="no_face" strikeLimit={3} onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText('Face Not Visible')).toBeInTheDocument();
  });

  it('falls back to the no_face message for an unrecognized reason', () => {
    render(<ProctoringWarningOverlay strike={1} reason={undefined} strikeLimit={3} onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText('Face Not Visible')).toBeInTheDocument();
  });

  it.each([
    ['tab_switch', 'Tab Switch Detected', 'We noticed you switched away from this exam tab.'],
    ['window_blur', 'Switched Application', 'We noticed you switched to another application.'],
    ['fullscreen_exit', 'Exited Fullscreen', 'We noticed you exited fullscreen mode.'],
    ['copy_paste', 'Copy/Paste Detected', 'We noticed copy or paste activity.'],
    ['right_click', 'Right-Click Detected', 'We noticed a right-click / context-menu action.'],
    ['dev_tools_detected', 'Developer Tools Detected', 'We noticed browser developer tools were opened.'],
    ['multi_monitor_detected', 'Additional Display Detected', 'We noticed an additional display was connected.'],
    ['idle_timeout', 'Inactivity Detected', 'We noticed no activity for several minutes.'],
    ['browser_activity_unspecified', 'Policy Violation Detected', 'We noticed unusual activity during this exam.'],
  ])('shows the %s message', (reason, heading, body) => {
    render(<ProctoringWarningOverlay strike={2} reason={reason} strikeLimit={3} onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByText('Warning 2/3')).toBeInTheDocument();
  });

  it('shows the strike count against the exam configured limit rather than a hardcoded 3', () => {
    render(
      <ProctoringWarningOverlay strike={1} strikeLimit={2} reason="tab_switch" onContinue={() => {}} continuePending={false} continueError={false} />,
    );

    expect(screen.getByText('Warning 1/2')).toBeInTheDocument();
  });
});

describe('ProctoringBlockOverlay', () => {
  it('mentions policy violations generically, not specifically webcam', () => {
    render(<ProctoringBlockOverlay />);
    expect(screen.getByText(/repeated policy violations/i)).toBeInTheDocument();
    expect(screen.queryByText(/webcam violations/i)).not.toBeInTheDocument();
  });

  it('still tells the candidate a recruiter needs to unblock the session', () => {
    render(<ProctoringBlockOverlay />);
    expect(screen.getByText(/recruiter needs to unblock/i)).toBeInTheDocument();
  });
});
