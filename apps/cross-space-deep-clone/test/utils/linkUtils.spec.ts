import { describe, expect, it } from 'vitest';
import { isAssetLink, isEntryLink, normalizeAssetUrl } from '../../src/utils/linkUtils';

describe('linkUtils', () => {
  it('detects entry links', () => {
    expect(isEntryLink({ sys: { type: 'Link', linkType: 'Entry', id: 'abc' } })).toBe(true);
    expect(isAssetLink({ sys: { type: 'Link', linkType: 'Entry', id: 'abc' } })).toBe(false);
  });

  it('detects asset links', () => {
    expect(isAssetLink({ sys: { type: 'Link', linkType: 'Asset', id: 'asset-1' } })).toBe(true);
  });

  it('normalizes protocol-relative asset urls', () => {
    expect(normalizeAssetUrl('//images.ctfassets.net/example.jpg')).toBe(
      'https://images.ctfassets.net/example.jpg'
    );
  });
});
