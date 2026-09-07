import { renderTemplateString } from './render-template-string';

describe('renderTemplateString', () => {
  it('substitutes known vars', () => {
    expect(renderTemplateString('Hi {{name}}, welcome to {{org}}.', { name: 'Ada', org: 'Acme' })).toBe(
      'Hi Ada, welcome to Acme.',
    );
  });

  it('replaces a missing var with an empty string', () => {
    expect(renderTemplateString('Hi {{name}}!', {})).toBe('Hi !');
  });

  it('leaves non-{{}} text intact', () => {
    expect(renderTemplateString('Plain text, no tokens here.', { name: 'Ada' })).toBe(
      'Plain text, no tokens here.',
    );
  });

  it('does not throw on unmatched braces', () => {
    expect(() => renderTemplateString('Hi {{name, missing close', { name: 'Ada' })).not.toThrow();
    expect(renderTemplateString('Hi {{name, missing close', { name: 'Ada' })).toBe(
      'Hi {{name, missing close',
    );
    expect(() => renderTemplateString('Hi name}} missing open', {})).not.toThrow();
  });

  it('tolerates whitespace inside {{ key }}', () => {
    expect(renderTemplateString('Hi {{ name }}!', { name: 'Ada' })).toBe('Hi Ada!');
    expect(renderTemplateString('Hi {{  name  }}!', { name: 'Ada' })).toBe('Hi Ada!');
  });
});
