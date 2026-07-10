import { describe, expect, it } from 'vitest';
import {
  rewriteRichTextDocument,
  stripEmbedsFromRichTextDocument,
} from '../../src/utils/richTextUtils';

describe('richTextUtils', () => {
  it('keeps embedded entry blocks with source id when target is not mapped', () => {
    const document = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'paragraph',
          data: {},
          content: [
            { nodeType: 'text', value: 'Intro', marks: [], data: {} },
            {
              nodeType: 'embedded-entry-inline',
              data: {
                target: {
                  sys: { type: 'Link', linkType: 'Entry', id: 'missing-entry' },
                },
              },
              content: [],
            },
          ],
        },
      ],
    };

    const result = rewriteRichTextDocument(document, {}, {});

    expect(result.rewrittenCount).toBe(0);
    expect(result.unmappedEmbeds).toEqual(['missing-entry']);
    expect(JSON.stringify(document)).toContain('embedded-entry-inline');
    expect(document.content[0]?.content).toHaveLength(2);
    expect(
      (
        document.content[0]?.content[1]?.data?.target as {
          sys: { id: string };
        }
      ).sys.id
    ).toBe('missing-entry');
  });

  it('rewrites embedded entry blocks when target is mapped', () => {
    const document = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'embedded-entry-block',
          data: {
            target: {
              sys: { type: 'Link', linkType: 'Entry', id: 'source-entry' },
            },
          },
          content: [],
        },
      ],
    };

    const result = rewriteRichTextDocument(document, { 'source-entry': 'target-entry' }, {});

    expect(result.rewrittenCount).toBe(1);
    expect(result.unmappedEmbeds).toEqual([]);
    expect(document.content).toHaveLength(1);
    expect(document.content[0]?.nodeType).toBe('embedded-entry-block');
    expect(
      (document.content[0]?.data?.target as { sys: { id: string } }).sys.id
    ).toBe('target-entry');
  });

  it('preserves external hyperlink nodes', () => {
    const document = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'hyperlink',
          data: { uri: 'https://example.com' },
          content: [{ nodeType: 'text', value: 'Example', marks: [], data: {} }],
        },
      ],
    };

    rewriteRichTextDocument(document, {}, {});

    expect(document.content[0]?.nodeType).toBe('hyperlink');
    expect(document.content[0]?.data?.uri).toBe('https://example.com');
  });

  it('removes all embedded nodes for the create pass', () => {
    const document = {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'paragraph',
          data: {},
          content: [
            { nodeType: 'text', value: 'Intro', marks: [], data: {} },
            {
              nodeType: 'embedded-entry-inline',
              data: {
                target: {
                  sys: { type: 'Link', linkType: 'Entry', id: 'missing-entry' },
                },
              },
              content: [],
            },
          ],
        },
      ],
    };

    const removed = stripEmbedsFromRichTextDocument(document);

    expect(removed).toBeGreaterThan(0);
    expect(JSON.stringify(document)).not.toContain('embedded-entry-inline');
    expect(document.content[0]?.content).toHaveLength(1);
    expect(document.content[0]?.content[0]?.value).toBe('Intro');
  });
});
