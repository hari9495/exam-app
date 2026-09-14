import { render, screen, fireEvent } from '@testing-library/react';
import { useCertificateTemplate, useUpsertCertificateTemplate } from '../../../../../lib/hooks/useCertificateTemplate';
import V2CertificateSettingsPage from './page';

jest.mock('../../../../../lib/hooks/useCertificateTemplate', () => {
  const actual = jest.requireActual('../../../../../lib/hooks/useCertificateTemplate');
  return { ...actual, useCertificateTemplate: jest.fn(), useUpsertCertificateTemplate: jest.fn() };
});

describe('V2CertificateSettingsPage', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    mutate.mockClear();
    (useUpsertCertificateTemplate as jest.Mock).mockReturnValue({ mutate, isPending: false });
  });

  it('loads the current template into the editor', () => {
    (useCertificateTemplate as jest.Mock).mockReturnValue({
      data: { title: 'Certificate of Achievement', bodyText: 'Well done {{candidateName}}', signatoryName: 'Jordan', enabled: true, isDefault: false },
      isLoading: false,
    });
    render(<V2CertificateSettingsPage />);
    expect(screen.getByLabelText('Certificate title')).toHaveValue('Certificate of Achievement');
    expect(screen.getByLabelText('Certificate body')).toHaveValue('Well done {{candidateName}}');
    expect(screen.getByLabelText('Certificate signatory')).toHaveValue('Jordan');
  });

  it('lists the merge variables', () => {
    (useCertificateTemplate as jest.Mock).mockReturnValue({ data: { title: 'T', bodyText: 'B', signatoryName: null, enabled: true, isDefault: true }, isLoading: false });
    render(<V2CertificateSettingsPage />);
    for (const token of ['{{candidateName}}', '{{examTitle}}', '{{scorePercent}}']) {
      expect(screen.getAllByText(token).length).toBeGreaterThan(0);
    }
  });

  it('Save fires the upsert with the edited fields', () => {
    (useCertificateTemplate as jest.Mock).mockReturnValue({ data: { title: 'T', bodyText: 'B', signatoryName: null, enabled: true, isDefault: false }, isLoading: false });
    render(<V2CertificateSettingsPage />);
    fireEvent.change(screen.getByLabelText('Certificate body'), { target: { value: 'Updated body {{examTitle}}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save certificate' }));
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'T', bodyText: 'Updated body {{examTitle}}', enabled: true }),
      expect.anything(),
    );
  });
});
