import { renderTemplate, templateReferencesStatusLink, buildCandidateEmailHtml } from './candidate-email-render';

const ctx = { candidateName: 'Asha Rao', jobTitle: 'Backend Engineer', orgName: 'Acme', recruiterName: 'Priya', statusLink: 'https://x/application/tok' };

describe('renderTemplate', () => {
  it('replaces every known token in subject and body', () => {
    const r = renderTemplate('Hi {{candidateName}} re {{jobTitle}}', 'From {{recruiterName}} at {{orgName}}: {{statusLink}}', ctx);
    expect(r.subject).toBe('Hi Asha Rao re Backend Engineer');
    expect(r.body).toBe('From Priya at Acme: https://x/application/tok');
  });
  it('leaves unknown tokens untouched (visible, not blanked)', () => {
    expect(renderTemplate('{{nope}}', 'x', ctx).subject).toBe('{{nope}}');
  });
  it('is idempotent — a rendered string has no tokens left to replace', () => {
    const once = renderTemplate('{{candidateName}}', '{{orgName}}', ctx);
    const twice = renderTemplate(once.subject, once.body, ctx);
    expect(twice).toEqual(once);
  });
});

describe('templateReferencesStatusLink', () => {
  it('detects the token in subject or body', () => {
    expect(templateReferencesStatusLink('x', 'see {{statusLink}}')).toBe(true);
    expect(templateReferencesStatusLink('{{statusLink}}', 'x')).toBe(true);
    expect(templateReferencesStatusLink('x', 'y')).toBe(false);
  });
});

describe('buildCandidateEmailHtml', () => {
  it('embeds a logo when given and converts newlines to <br>', () => {
    const html = buildCandidateEmailHtml({ logoUrl: 'https://l/logo.png', orgName: 'Acme', bodyText: 'Line 1\nLine 2' });
    expect(html).toContain('<img src="https://l/logo.png"');
    expect(html).toContain('Line 1<br />Line 2');
    expect(html).toContain('Acme');
  });
  it('omits the logo block when logoUrl is null', () => {
    expect(buildCandidateEmailHtml({ logoUrl: null, orgName: null, bodyText: 'Hi' })).not.toContain('<img');
  });
});
