import { describe, expect, it, vi } from 'vitest';
import { ReferenceGraph, collectUniqueNodeIds } from '../../src/utils/ReferenceGraph';
import { getMockAsset, getMockEntry } from './testUtils';
import { SpaceContext } from '../../src/utils/CmaClients';

describe('ReferenceGraph', () => {
  it('collects nested entry and asset references via entry.references', async () => {
    const childEntry = getMockEntry('child-entry', {
      title: { 'en-US': 'Child' },
    });
    const asset = getMockAsset('asset-1', 'Hero Image');
    const rootEntry = getMockEntry('root-entry', {
      title: { 'en-US': 'Root Page' },
      section: {
        'en-US': {
          sys: { type: 'Link', linkType: 'Entry', id: 'child-entry' },
        },
      },
      heroImage: {
        'en-US': {
          sys: { type: 'Link', linkType: 'Asset', id: 'asset-1' },
        },
      },
    });

    const client = {
      entry: {
        get: vi.fn(async ({ entryId }: { entryId: string }) => {
          if (entryId === 'root-entry') return rootEntry;
          if (entryId === 'child-entry') return childEntry;
          throw new Error('missing entry');
        }),
        references: vi.fn(async () => ({
          items: [childEntry],
          includes: {
            Entry: [childEntry],
            Asset: [asset],
          },
        })),
      },
      asset: {
        get: vi.fn(async ({ assetId }: { assetId: string }) => {
          if (assetId === 'asset-1') return asset;
          throw new Error('missing asset');
        }),
      },
      contentType: {
        get: vi.fn(async () => ({
          sys: { id: 'testContentType' },
          name: 'Test Content Type',
          displayField: 'title',
          fields: [{ id: 'title', name: 'Title', type: 'Symbol' }],
        })),
      },
    };

    const source: SpaceContext = {
      spaceId: 'source-space',
      environmentId: 'master',
      client: client as unknown as SpaceContext['client'],
    };

    const graph = new ReferenceGraph(source, 'root-entry');
    const tree = await graph.build();
    const data = graph.getData();

    expect(client.entry.references).toHaveBeenCalledOnce();
    expect(Object.keys(data.entries)).toEqual(['root-entry', 'child-entry']);
    expect(Object.keys(data.assets)).toEqual(['asset-1']);
    expect(tree.children.some((child) => child.type === 'entry' && child.id === 'child-entry')).toBe(true);
    expect(tree.children.some((child) => child.type === 'asset' && child.id === 'asset-1')).toBe(true);
    expect(tree.contentTypeId).toBe('testContentType');
    expect(tree.contentTypeName).toBe('Test Content Type');
    expect(tree.status).toBe('draft');
    expect(graph.getEntryContentTypes()['root-entry']).toEqual({
      contentTypeId: 'testContentType',
      contentTypeName: 'Test Content Type',
    });
  });

  it('falls back to recursive fetch when entry.references fails', async () => {
    const childEntry = getMockEntry('child-entry', {
      title: { 'en-US': 'Child' },
    });
    const rootEntry = getMockEntry('root-entry', {
      title: { 'en-US': 'Root Page' },
      section: {
        'en-US': {
          sys: { type: 'Link', linkType: 'Entry', id: 'child-entry' },
        },
      },
    });

    const client = {
      entry: {
        get: vi.fn(async ({ entryId }: { entryId: string }) => {
          if (entryId === 'root-entry') return rootEntry;
          if (entryId === 'child-entry') return childEntry;
          throw new Error('missing entry');
        }),
        references: vi.fn(async () => {
          throw new Error('references unavailable');
        }),
      },
      asset: {
        get: vi.fn(),
      },
      contentType: {
        get: vi.fn(async () => ({
          sys: { id: 'testContentType' },
          name: 'Test Content Type',
          displayField: 'title',
          fields: [{ id: 'title', name: 'Title', type: 'Symbol' }],
        })),
      },
    };

    const source: SpaceContext = {
      spaceId: 'source-space',
      environmentId: 'master',
      client: client as unknown as SpaceContext['client'],
    };

    const graph = new ReferenceGraph(source, 'root-entry');
    const tree = await graph.build();

    expect(client.entry.references).toHaveBeenCalledOnce();
    expect(client.entry.get).toHaveBeenCalled();
    expect(tree.children.some((child) => child.id === 'child-entry')).toBe(true);
  });

  it('filters selected entries and assets', async () => {
    const rootEntry = getMockEntry('root-entry', { title: { 'en-US': 'Root' } });
    const client = {
      entry: {
        get: vi.fn(async () => rootEntry),
        references: vi.fn(async () => ({
          items: [],
          includes: {},
        })),
      },
      asset: {
        get: vi.fn(),
      },
      contentType: {
        get: vi.fn(async () => ({
          sys: { id: 'testContentType' },
          name: 'Test Content Type',
          displayField: 'title',
          fields: [{ id: 'title', name: 'Title', type: 'Symbol' }],
        })),
      },
    };

    const source: SpaceContext = {
      spaceId: 'source-space',
      environmentId: 'master',
      client: client as unknown as SpaceContext['client'],
    };

    const graph = new ReferenceGraph(source, 'root-entry');
    await graph.build();
    const filtered = graph.filter(['root-entry'], []);

    expect(Object.keys(filtered.entries)).toEqual(['root-entry']);
    expect(Object.keys(filtered.assets)).toEqual([]);
  });

  it('deduplicates repeated entry ids in the tree', () => {
    const tree = {
      id: 'root-entry',
      type: 'entry' as const,
      label: 'Root',
      children: [
        {
          id: 'child-entry',
          type: 'entry' as const,
          label: 'Child',
          children: [],
        },
        {
          id: 'child-entry',
          type: 'entry' as const,
          label: 'Child duplicate branch',
          children: [],
        },
      ],
    };

    const { entryIds } = collectUniqueNodeIds(tree);
    expect(entryIds.size).toBe(2);
  });
});
