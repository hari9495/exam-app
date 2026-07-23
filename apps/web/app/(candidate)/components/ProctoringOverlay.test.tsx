import { render, screen } from '@testing-library/react';
import { ProctoringWarningOverlay, ProctoringBlockOverlay } from './ProctoringOverlay';

describe('ProctoringWarningOverlay', () => {
  const noop = () => undefined;

  it('shows the multiple_faces message', () => {
    render(<ProctoringWarningOverlay strike={1} reason="multiple_faces" onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText('More than one person detected')).toBeInTheDocument();
  });

  it('shows the no_face message', () => {
    render(<ProctoringWarningOverlay strike={1} reason="no_face" onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText('Face not visible')).toBeInTheDocument();
  });

  it('falls back to the no_face message for an unrecognized reason', () => {
    render(<ProctoringWarningOverlay strike={1} reason={undefined} onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText('Face not visible')).toBeInTheDocument();
  });

  it.each([
    ['tab_switch', 'Tab switch detected', 'We noticed you switched away from this exam tab.'],
    ['window_blur', 'Switched application', 'We noticed you switched to another application.'],
    ['fullscreen_exit', 'Exited fullscreen', 'We noticed you exited fullscreen mode.'],
    ['copy_paste', 'Copy/paste detected', 'We noticed copy or paste activity.'],
    ['right_click', 'Right-click detected', 'We noticed a right-click / context-menu action.'],
    ['dev_tools_detected', 'Developer tools detected', 'We noticed browser developer tools were opened.'],
    ['multi_monitor_detected', 'Additional display detected', 'We noticed an additional display was connected.'],
    ['idle_timeout', 'Inactivity detected', 'We noticed no activity for several minutes.'],
    ['browser_activity_unspecified', 'Policy violation detected', 'We noticed unusual activity during this exam.'],
  ])('shows the %s message', (reason, heading, body) => {
    render(<ProctoringWarningOverlay strike={2} reason={reason} onContinue={noop} continuePending={false} continueError={false} />);
    expect(screen.getByText(heading)).toBeInTheDocument();
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.getByText('Warning 2/3')).toBeInTheDocument();
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
