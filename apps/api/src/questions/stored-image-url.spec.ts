import { toStoredImageUrl } from './questions.service';

const BLOB = 'https://acct.blob.core.windows.net/container/question-images/abc.png';

describe('toStoredImageUrl', () => {
  // The bug this exists for: reads sign the URL, the edit form posts the signed value back, and
  // storing it verbatim persisted a ~20-minute SAS. Twenty minutes later the image was dead and
  // unrecoverable -- signIfOurs cannot re-sign a URL that already carries a token. So merely
  // editing a question's TEXT silently destroyed its picture.
  it('drops a SAS token that a read handed back', () => {
    const signed =
      `${BLOB}?sv=2026-06-06&spr=https&st=2026-08-07T19%3A41%3A07Z&se=2026-08-07T20%3A01%3A07Z&sr=b&sp=r&sig=abc%3D`;
    expect(toStoredImageUrl(signed)).toBe(BLOB);
  });

  it('leaves an already-clean URL untouched', () => {
    expect(toStoredImageUrl(BLOB)).toBe(BLOB);
  });

  it('is idempotent, so re-saving the same question cannot degrade it', () => {
    expect(toStoredImageUrl(toStoredImageUrl(`${BLOB}?sig=x`))).toBe(BLOB);
  });

  it('normalises absent values to null rather than empty string', () => {
    expect(toStoredImageUrl(null)).toBeNull();
    expect(toStoredImageUrl(undefined)).toBeNull();
    expect(toStoredImageUrl('')).toBeNull();
  });

  it('does not mistake a fragment or a bare query for the blob path', () => {
    expect(toStoredImageUrl('?sig=only')).toBe('');
  });
});
