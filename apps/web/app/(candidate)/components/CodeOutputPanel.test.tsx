import { render, screen } from '@testing-library/react';
import { CodeOutputPanel } from './CodeOutputPanel';

describe('CodeOutputPanel', () => {
  it('renders nothing when there is no result or error', () => {
    const { container } = render(<CodeOutputPanel result={null} error={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the error string when present, taking priority over a stale result', () => {
    render(<CodeOutputPanel result={{ stdout: 'old', stderr: '', exitCode: 0, compileError: null, timedOut: false, runsRemaining: 30 }} error="Couldn't run your code right now, try again." />);
    expect(screen.getByText("Couldn't run your code right now, try again.")).toBeInTheDocument();
    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });

  it('renders a success badge and stdout for exit code 0', () => {
    render(<CodeOutputPanel result={{ stdout: 'hi\n', stderr: '', exitCode: 0, compileError: null, timedOut: false, runsRemaining: 30 }} error={null} />);
    expect(screen.getByText('Exit code: 0')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
  });

  it('renders a failure badge and stderr for a nonzero exit code', () => {
    render(<CodeOutputPanel result={{ stdout: '', stderr: 'ReferenceError: x is not defined', exitCode: 1, compileError: null, timedOut: false, runsRemaining: 30 }} error={null} />);
    expect(screen.getByText('Exit code: 1')).toBeInTheDocument();
    expect(screen.getByText('ReferenceError: x is not defined')).toBeInTheDocument();
  });

  it('renders compileError instead of stdout/stderr when present', () => {
    render(<CodeOutputPanel result={{ stdout: 'ignored', stderr: '', exitCode: 1, compileError: 'main.cpp:3: error: expected \';\'', timedOut: false, runsRemaining: 30 }} error={null} />);
    expect(screen.getByText('main.cpp:3: error: expected \';\'')).toBeInTheDocument();
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });

  it('renders the timeout message', () => {
    render(<CodeOutputPanel result={{ stdout: '', stderr: '', exitCode: 137, compileError: null, timedOut: true, runsRemaining: 30 }} error={null} />);
    expect(screen.getByText('Your program was stopped for taking too long.')).toBeInTheDocument();
  });
});
