import { describe, expect, it } from 'vitest';
import {
  formatContentTypeLabel,
  parseContentTypeFromLabel,
} from '../../src/utils/entryContentTypes';
import { CloneReferenceNode } from '../../src/utils/ReferenceGraph';

describe('entryContentTypes', () => {
  it('parses content type id from label suffix', () => {
    expect(parseContentTypeFromLabel('Pricing Hero · pricingHero')).toEqual({
      title: 'Pricing Hero',
      contentTypeId: 'pricingHero',
    });
  });

  it('formats content type from label when lookup map is empty', () => {
    const node: CloneReferenceNode = {
      id: 'entry-1',
      type: 'entry',
      label: 'Pricing Hero · pricingHero',
      children: [],
    };

    expect(formatContentTypeLabel(node, {})).toBe('pricingHero');
  });

  it('prefers lookup map names over label suffix', () => {
    const node: CloneReferenceNode = {
      id: 'entry-1',
      type: 'entry',
      label: 'Pricing Hero · pricingHero',
      children: [],
    };

    expect(
      formatContentTypeLabel(node, {
        'entry-1': { contentTypeId: 'pricingHero', contentTypeName: 'Pricing Hero Section' },
      })
    ).toBe('Pricing Hero Section (pricingHero)');
  });
});
