import { render, screen, fireEvent } from '@testing-library/react';
import { useCareersSettings, useUpdateCareersSettings, useUploadCareersBanner } from '../../../../../lib/hooks/useCareersSettings';
import V2CareersSettingsPage from './page';

jest.mock('../../../../../lib/hooks/useCareersSettings', () => ({
  useCareersSettings: jest.fn(),
  useUpdateCareersSettings: jest.fn(),
  useUploadCareersBanner: jest.fn(),
}));

jest.mock('../../../../../lib/auth-context', () => ({ useAuth: () => ({ organizationSlug: 'demo-org' }) }));

describe('V2CareersSettingsPage', () => {
  const updateMutate = jest.fn();
  const uploadMutate = jest.fn();

  beforeEach(() => {
    updateMutate.mockClear();
    uploadMutate.mockClear();
    (useUpdateCareersSettings as jest.Mock).mockReturnValue({ mutate: updateMutate, isPending: false });
    (useUploadCareersBanner as jest.Mock).mockReturnValue({ mutate: uploadMutate, isPending: false });
  });

  it('renders the currently configured settings from the GET', () => {
    (useCareersSettings as jest.Mock).mockReturnValue({
      data: { enabled: true, headline: 'Join us', intro: 'We are hiring', bannerUrl: 'https://cdn.example.com/banner.png' },
      isLoading: false,
    });

    render(<V2CareersSettingsPage />);

    expect(screen.getByLabelText('Enable careers site')).toBeChecked();
    expect(screen.getByLabelText('Headline')).toHaveValue('Join us');
    expect(screen.getByLabelText('Intro')).toHaveValue('We are hiring');
    expect(screen.getByAltText('Current careers banner')).toHaveAttribute('src', 'https://cdn.example.com/banner.png');
  });

  it('seeds blank fields and shows no banner when nothing is configured yet', () => {
    (useCareersSettings as jest.Mock).mockReturnValue({
      data: { enabled: false, headline: null, intro: null, bannerUrl: null },
      isLoading: false,
    });

    render(<V2CareersSettingsPage />);

    expect(screen.getByLabelText('Enable careers site')).not.toBeChecked();
    expect(screen.getByLabelText('Headline')).toHaveValue('');
    expect(screen.getByLabelText('Intro')).toHaveValue('');
    expect(screen.queryByAltText('Current careers banner')).not.toBeInTheDocument();
  });

  it('Save fires the PUT mutation with the edited values', () => {
    (useCareersSettings as jest.Mock).mockReturnValue({
      data: { enabled: false, headline: 'Old headline', intro: 'Old intro', bannerUrl: null },
      isLoading: false,
    });

    render(<V2CareersSettingsPage />);
    fireEvent.click(screen.getByLabelText('Enable careers site'));
    fireEvent.change(screen.getByLabelText('Headline'), { target: { value: 'New headline' } });
    fireEvent.change(screen.getByLabelText('Intro'), { target: { value: 'New intro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(updateMutate).toHaveBeenCalledWith(
      { enabled: true, headline: 'New headline', intro: 'New intro' },
      expect.anything(),
    );
  });

  it('shows a success notice after a successful save', () => {
    (useCareersSettings as jest.Mock).mockReturnValue({
      data: { enabled: true, headline: 'Join us', intro: 'We are hiring', bannerUrl: null },
      isLoading: false,
    });
    updateMutate.mockImplementation((_input, { onSuccess }) => onSuccess());

    render(<V2CareersSettingsPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByRole('status')).toHaveTextContent('Careers settings saved.');
  });

  it('banner upload fires the POST mutation with the selected file', () => {
    (useCareersSettings as jest.Mock).mockReturnValue({
      data: { enabled: true, headline: 'Join us', intro: 'We are hiring', bannerUrl: null },
      isLoading: false,
    });
    const file = new File(['banner-bytes'], 'banner.png', { type: 'image/png' });

    render(<V2CareersSettingsPage />);
    fireEvent.change(screen.getByLabelText(/Upload new banner/), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload banner' }));

    expect(uploadMutate).toHaveBeenCalledWith(file, expect.anything());
  });

  it('links to the public careers page using the org slug', () => {
    (useCareersSettings as jest.Mock).mockReturnValue({
      data: { enabled: true, headline: 'Join us', intro: 'We are hiring', bannerUrl: null },
      isLoading: false,
    });

    render(<V2CareersSettingsPage />);

    expect(screen.getByRole('link', { name: /view public careers page/i })).toHaveAttribute('href', '/careers/demo-org');
  });
});
