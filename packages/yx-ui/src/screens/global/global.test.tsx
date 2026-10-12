import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CountryGuideScreen, newEntityInput, type CountryGuideScreenProps } from './country-guide';
import { TranslationsScreen } from './translations';
import { MyLanguageScreen } from './my-language';
import { INDIA, SETUP_DONE, SETUP_NEW, TRANSLATIONS } from './data';

const ok = () => vi.fn().mockResolvedValue(undefined);

function Guide(over: Partial<CountryGuideScreenProps> = {}) {
  return (
    <CountryGuideScreen
      state="ready"
      countries={[INDIA]}
      setups={[SETUP_DONE]}
      entities={[]}
      entityDefaults={{}}
      canManage
      onStart={vi.fn().mockResolvedValue(SETUP_NEW)}
      onCreateEntity={vi.fn().mockResolvedValue({ id: 'le-new' })}
      onLinkEntity={vi.fn().mockResolvedValue({ ...SETUP_NEW, legalEntity: { id: 'le-new', name: 'Kaveri South', shortName: 'KSI' }, version: 2 })}
      onSaveDefaults={ok()}
      onFinish={vi.fn().mockResolvedValue({ ...SETUP_NEW, status: 'done' })}
      onRefresh={ok()}
      {...over}
    />
  );
}

describe('Add a country (G1.07)', () => {
  it('lists the countries set up, with their open items', () => {
    render(<Guide />);
    const list = screen.getByRole('list', { name: 'Your countries' });
    expect(within(list).getByText('India · Kaveri Foods Pvt Ltd')).toBeInTheDocument();
    expect(within(list).getByText('2 open')).toBeInTheDocument();
  });

  it('starts India from its pack, then creates the entity with the pack defaults', async () => {
    const onStart = vi.fn().mockResolvedValue(SETUP_NEW);
    const onCreateEntity = vi.fn().mockResolvedValue({ id: 'le-new' });
    render(<Guide onStart={onStart} onCreateEntity={onCreateEntity} />);
    await userEvent.click(screen.getByRole('button', { name: 'Add a country' }));
    expect(screen.getByText(/48 hours \(the legal limit/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Start the guide' }));
    expect(onStart).toHaveBeenCalledWith('IN');
    // No red error while typing; the problems show on the button press.
    await userEvent.type(await screen.findByRole('textbox', { name: /Short name/ }), '!');
    expect(screen.queryByText(/Short name: up to 30/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add legal entity' }));
    expect((await screen.findAllByText('Enter the registered name')).length).toBeGreaterThan(0);
    expect(onCreateEntity).not.toHaveBeenCalled();
    await userEvent.type(screen.getByRole('textbox', { name: /Registered name/ }), 'Kaveri South India');
    await userEvent.clear(screen.getByRole('textbox', { name: /Short name/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Short name/ }), 'KSI');
    await userEvent.click(screen.getByRole('button', { name: 'Add legal entity' }));
    await waitFor(() => expect(onCreateEntity).toHaveBeenCalledWith({ name: 'Kaveri South India', shortName: 'KSI', country: 'IN', currency: 'INR', fyStartMonth: 4, dataRegion: 'IN' }));
  });

  it('the entity input mirrors the API checks', () => {
    expect(newEntityInput({ name: ' ', shortName: 'x y z' }, INDIA).errors.map((e) => e.fieldId)).toEqual(['cg-name']);
    expect(newEntityInput({ name: 'A', shortName: '' }, INDIA).errors.map((e) => e.fieldId)).toEqual(['cg-short']);
  });

  it('without the settings key: the list only', () => {
    render(<Guide canManage={false} />);
    expect(screen.queryByRole('button', { name: 'Add a country' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'See open items' })).not.toBeInTheDocument();
  });
});

describe('Translations (G1.06)', () => {
  it('shows each language column and saves only what changed; an emptied box removes it', async () => {
    const onSave = ok();
    render(<TranslationsScreen state="ready" subjectType="leave_type" onSubjectType={() => {}} list={TRANSLATIONS} canManage onSave={onSave} />);
    expect(screen.getByText('ஈட்டிய விடுப்பு')).toBeInTheDocument();
    expect(screen.getAllByText('Not translated').length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Translate Earned leave' }));
    await userEvent.clear(screen.getByRole('textbox', { name: /Tamil/ }));
    await userEvent.type(screen.getByRole('textbox', { name: /Telugu/ }), 'సంపాదిత సెలవు');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenCalledWith('lt-el', 'ta', null);
    expect(onSave).toHaveBeenCalledWith('lt-el', 'te', 'సంపాదిత సెలవు');
  });

  it('read-only without the settings key', () => {
    render(<TranslationsScreen state="ready" subjectType="leave_type" onSubjectType={() => {}} list={TRANSLATIONS} canManage={false} onSave={ok()} />);
    expect(screen.queryByRole('button', { name: /Translate/ })).not.toBeInTheDocument();
  });
});

describe('Me › Language (G1.06)', () => {
  it('a single choice of four is the Segment control; saving sends the choice', async () => {
    const onSave = ok();
    render(<MyLanguageScreen state="ready" data={{ language: 'en', chosen: false, companyLanguage: 'en', choices: ['en', 'hi', 'ta', 'te'] }} onSave={onSave} />);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: 'தமிழ் (Tamil)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('ta'));
    expect(await screen.findByText(/Saved\. Company words now show in தமிழ்/)).toBeInTheDocument();
  });
});
