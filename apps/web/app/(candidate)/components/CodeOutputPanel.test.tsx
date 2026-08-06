import { render, screen } from '@testing-library/react';
import { CodeOutputPanel } from './CodeOutputPanel';

describe('CodeOutputPanel', () => {
  it('shows a placeholder prompting the candidate to run their code when there is no result or error yet', () => {
    render(<CodeOutputPanel result={null} error={null} />);
    expect(screen.getByText('Click Run to see your output here.')).toBeInTheDocument();
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

  it('renders a timeout message naming the limit and the likely cause', () => {
    render(<CodeOutputPanel result={{ stdout: '', stderr: '', exitCode: 137, compileError: null, timedOut: true, runsRemaining: 30 }} error={null} />);
    // The old copy just said the program "was stopped for taking too long", which told a
    // candidate nothing actionable -- they would re-run the same non-terminating code and lose
    // another attempt. Both halves matter: how long they got, and what to go looking for.
    expect(screen.getByText(/ran for more than 5 seconds/)).toBeInTheDocument();
    expect(screen.getByText(/loop never finishes/)).toBeInTheDocument();
  });
});
