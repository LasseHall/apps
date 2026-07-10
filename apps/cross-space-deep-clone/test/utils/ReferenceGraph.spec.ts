import { describe, expect, it, vi } from 'vitest';
import { ReferenceGraph } from '../../src/utils/ReferenceGraph';
import { getMockAsset, getMockEntry } from './testUtils';
import { SpaceContext } from '../../src/utils/CmaClients';

describe('ReferenceGraph', () => {
  it('collects nested entry and asset references', async () => {
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

    expect(Object.keys(data.entries)).toEqual(['root-entry', 'child-entry']);
    expect(Object.keys(data.assets)).toEqual(['asset-1']);
    expect(tree.children.some((child) => child.type === 'entry' && child.id === 'child-entry')).toBe(true);
    expect(tree.children.some((child) => child.type === 'asset' && child.id === 'asset-1')).toBe(true);
  });

  it('filters selected entries and assets', async () => {
    const rootEntry = getMockEntry('root-entry', { title: { 'en-US': 'Root' } });
    const client = {
      entry: {
        get: vi.fn(async () => rootEntry),
      },
      asset: {
        get: vi.fn(),
      },
      contentType: {
        get: vi.fn(async () => ({
          sys: { id: 'testContentType' },
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
});
