import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CameraPreview } from './CameraPreview';

describe('CameraPreview', () => {
  it('shows a call to action and calls onEnable when idle', async () => {
    const onEnable = jest.fn();
    render(<CameraPreview status="idle" onEnable={onEnable} />);
    await userEvent.click(screen.getByRole('button', { name: 'Enable camera' }));
    expect(onEnable).toHaveBeenCalled();
  });

  it('shows a connected state when granted', () => {
    render(<CameraPreview status="granted" onEnable={jest.fn()} />);
    expect(screen.getByText('Camera connected')).toBeInTheDocument();
  });

  it('shows a blocked state with a retry action when denied', async () => {
    const onEnable = jest.fn();
    render(<CameraPreview status="denied" onEnable={onEnable} />);
    expect(screen.getByText('Camera access blocked')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry camera access' }));
    expect(onEnable).toHaveBeenCalled();
  });

  it('shows a checking state', () => {
    render(<CameraPreview status="checking" onEnable={jest.fn()} />);
    expect(screen.getByText('Requesting camera…')).toBeInTheDocument();
  });
});
