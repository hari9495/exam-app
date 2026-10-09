import { cleanHtml, htmlToText, textToHtml } from './rich-text';

// §14.2 / §15 XSS in rich text: the allow-list keeps formatting and safe links only.
describe('rich text cleaning (sanitize-html allow-list)', () => {
  it.each([
    ['<p>Hi<script>alert(1)</script></p>', '<p>Hi</p>'],
    ['<img src=x onerror="alert(1)">', ''],
    ['<p onclick="steal()">Click</p>', '<p>Click</p>'],
    ['<a href="javascript:alert(1)">x</a>', '<a rel="noopener noreferrer nofollow" target="_blank">x</a>'],
    ['<a href="//evil.test/x">x</a>', '<a rel="noopener noreferrer nofollow" target="_blank">x</a>'],
    ['<iframe src="https://evil.test"></iframe><p>ok</p>', '<p>ok</p>'],
    ['<svg><script>alert(1)</script></svg>', ''],
    ['<p style="background:url(javascript:alert(1))">x</p>', '<p>x</p>'],
    ['<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', '<a rel="noopener noreferrer nofollow" target="_blank">x</a>'],
  ])('%s', (dirty, clean) => {
    expect(cleanHtml(dirty)).toBe(clean);
  });

  it('keeps simple formatting and makes links safe', () => {
    expect(cleanHtml('<p><strong>Restart</strong> the <em>VPN</em></p><ul><li>one</li></ul><a href="https://help.test/a" target="_self">guide</a>')).toBe(
      '<p><strong>Restart</strong> the <em>VPN</em></p><ul><li>one</li></ul><a href="https://help.test/a" target="_blank" rel="noopener noreferrer nofollow">guide</a>',
    );
  });

  it('turns HTML into plain text and typed text into safe HTML', () => {
    expect(htmlToText('<p>Line 1</p><p>Fish &amp; chips &lt;b&gt;</p>')).toBe('Line 1\nFish & chips <b>');
    expect(textToHtml('Hello <b>\nthere\n\nNew para')).toBe('<p>Hello &lt;b&gt;<br />there</p><p>New para</p>');
    expect(htmlToText(cleanHtml('<script>x</script>'))).toBe('');
  });
});
