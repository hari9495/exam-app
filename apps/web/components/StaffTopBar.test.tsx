import { render, screen } from '@testing-library/react';
import { StaffTopBar } from './StaffTopBar';

function renderTopBar(props: Partial<React.ComponentProps<typeof StaffTopBar>> = {}) {
  return render(
    <StaffTopBar
      displayName="Jane Recruiter"
      initials="JR"
      roleLabel="Recruiter"
      onLogout={() => {}}
      {...props}
    />,
  );
}

describe('StaffTopBar', () => {
  it('shows initials when the user has no profile picture', () => {
    renderTopBar({ avatarUrl: null });
    expect(screen.getByText('JR')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the profile picture instead of initials when one is set', () => {
    renderTopBar({ avatarUrl: 'https://blob.test/avatars/u1.png?sig=abc' });
    // Decorative: the adjacent link already reads out the user's name, so the image is alt=""
    // and queried by src rather than by role.
    const image = document.querySelector('img');
    expect(image).toHaveAttribute('src', 'https://blob.test/avatars/u1.png?sig=abc');
    expect(screen.queryByText('JR')).not.toBeInTheDocument();
  });

  it('falls back to initials when the shell has not loaded the user yet', () => {
    // avatarUrl is undefined while useCurrentUser is still in flight -- the bar must not render
    // a broken <img src="undefined"> in that window.
    renderTopBar({ avatarUrl: undefined });
    expect(screen.getByText('JR')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });
});
