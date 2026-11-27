import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FormField } from '../components/field';
import { TextField } from '../components/inputs';
import { Card, DescriptionList, PageHeader } from '../components/shell';
import { DataTable } from '../components/table';
import { applyTerms, DEFAULT_TERMS, TermsProvider, type Terms } from './terms';
import { MORE_SETTINGS } from '../screens/settings/time-settings-live';

// T2-G 84a (answer 2743): the company's own words for department, grade and the rest, through one helper.
const OURS: Terms = { ...DEFAULT_TERMS, department: { one: 'Business unit', many: 'Business units' }, employee: { one: 'Associate', many: 'Associates' }, grade: { one: 'BU level', many: 'BU levels' } };

describe('applyTerms (the same rules as the API)', () => {
  it('whole words, singular and plural, capital or lower case, abbreviations kept', () => {
    expect(applyTerms('Department: choose a department; all departments', OURS)).toBe('Business unit: choose a business unit; all business units');
    expect(applyTerms('Employee code and your grade', OURS)).toBe('Associate code and your BU level');
  });
  it("negative: the law's names, capitals, parts of words, links and tags never change", () => {
    expect(applyTerms("Employees' Provident Fund", OURS)).toBe("Employees' Provident Fund");
    expect(applyTerms('EMPLOYEE departmental', OURS)).toBe('EMPLOYEE departmental');
    expect(applyTerms('<a href="/x/department">Department</a>', OURS)).toBe('<a href="/x/department">Business unit</a>');
  });
});

describe('the kit labels', () => {
  const ui = (
    <>
      <PageHeader title="Departments" description="Every department and its head." />
      <Card title="Grade and department">
        <FormField label="Department">
          <TextField value="" onChange={() => undefined} />
        </FormField>
        <DescriptionList items={[{ label: 'Employee code', value: 'KF-0042' }]} />
        <DataTable label="People" columns={[{ key: 'd', header: 'Department', value: (r: { d: string }) => r.d }]} rows={[{ d: 'Quality' }]} getRowId={(r) => r.d} />
      </Card>
    </>
  );

  it("show the company's words under TermsProvider: page and card titles, field labels, detail lists, table headers", () => {
    render(<TermsProvider terms={OURS}>{ui}</TermsProvider>);
    expect(screen.getByRole('heading', { name: 'Business units' })).toBeInTheDocument();
    expect(screen.getByText('Every business unit and its head.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'BU level and business unit' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Business unit/ })).toBeInTheDocument();
    expect(screen.getByText('Associate code')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Business unit/ })).toBeInTheDocument();
  });

  it("negative: without a provider (or with YukthiX's words) nothing changes", () => {
    const { unmount } = render(ui);
    expect(screen.getByRole('heading', { name: 'Departments' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /Department/ })).toBeInTheDocument();
    unmount();
    render(<TermsProvider terms={DEFAULT_TERMS}>{ui}</TermsProvider>);
    expect(screen.getByText('Employee code')).toBeInTheDocument();
  });

  it('every term has its two settings on Settings 1.1 (Our words)', () => {
    const keys = MORE_SETTINGS['1.1']!.settings.filter((p) => p.section === 'Our words').map((p) => p.key);
    expect(keys).toHaveLength(14);
    for (const k of Object.keys(DEFAULT_TERMS)) expect(keys).toEqual(expect.arrayContaining([`terms.${k}.one`, `terms.${k}.many`]));
  });
});
