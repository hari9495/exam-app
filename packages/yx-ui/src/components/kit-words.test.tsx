import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { FormField } from './field';
import { PasswordField, TextField } from './inputs';
import { PoweredBy } from './brand';
import { KIT_WORDS_EN, KitWordsContext, type KitWords } from './kit-words';

const HI: KitWords = { ...KIT_WORDS_EN, required: 'आवश्यक', optional: 'वैकल्पिक', showPassword: 'पासवर्ड दिखाएँ', hidePassword: 'पासवर्ड छिपाएँ', poweredBy: { before: '', after: 'द्वारा संचालित', label: 'YukthiX द्वारा संचालित' } };

const fields = (
  <>
    <FormField label="Email" required>
      <TextField value="" onChange={() => {}} />
    </FormField>
    <FormField label="Note" optional>
      <TextField value="" onChange={() => {}} />
    </FormField>
    <FormField label="Password" required>
      <PasswordField value="" onChange={() => {}} />
    </FormField>
    <PoweredBy />
  </>
);

describe('kit words (field tags, password eye, Powered by)', () => {
  it('English by default: "Required", "Optional", "Show password", "Powered by"', async () => {
    render(fields);
    expect(screen.getAllByText('Required')).toHaveLength(2);
    expect(screen.getByText('Optional')).toBeInTheDocument();
    const eye = screen.getByRole('button', { name: 'Show password' });
    await userEvent.click(eye);
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Powered by YukthiX' })).toHaveTextContent('Powered by');
  });

  it('a page that passes a language gets the tags in that language, and nothing English is left', async () => {
    render(<KitWordsContext.Provider value={HI}>{fields}</KitWordsContext.Provider>);
    expect(screen.getAllByText('आवश्यक')).toHaveLength(2);
    expect(screen.getByText('वैकल्पिक')).toBeInTheDocument();
    expect(screen.queryByText('Required')).toBeNull();
    expect(screen.queryByText('Optional')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'पासवर्ड दिखाएँ' }));
    expect(screen.getByRole('button', { name: 'पासवर्ड छिपाएँ' })).toBeInTheDocument();
    const powered = screen.getByRole('link', { name: 'YukthiX द्वारा संचालित' });
    expect(powered).toHaveTextContent('द्वारा संचालित');
    expect(powered).not.toHaveTextContent('Powered by');
  });
});
