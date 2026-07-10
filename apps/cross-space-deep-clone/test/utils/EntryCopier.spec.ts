import { describe, expect, it, vi } from 'vitest';
import { EntryCopier } from '../../src/utils/EntryCopier';
import { getMockEntry } from './testUtils';
import { SpaceContext } from '../../src/utils/CmaClients';

function buildEntryCopierClient(
  createdEntries: Record<string, ReturnType<typeof getMockEntry>>
) {
  return {
    contentType: {
      get: vi.fn(async () => ({
        sys: { id: 'testContentType' },
        displayField: 'title',
        fields: [{ id: 'title', name: 'Title', type: 'Symbol' }],
      })),
    },
    entry: {
      createWithId: vi.fn(async ({ entryId }: { entryId: string }) => {
        const entry = {
          ...getMockEntry(entryId, {}),
          sys: {
            ...getMockEntry(entryId, {}).sys,
            id: entryId,
            version: 1,
          },
          fields: {},
        };
        createdEntries[entryId] = entry;
        return entry;
      }),
      update: vi.fn(async (_params: unknown, payload: { fields: unknown; sys: { version: number } }) => {
        const entryId = Object.keys(createdEntries).find((id) => createdEntries[id]?.sys.version === payload.sys.version);
        const resolvedEntryId = entryId ?? 'root-source';
        const existing = createdEntries[resolvedEntryId] ?? getMockEntry(resolvedEntryId, {});
        const updated = {
          ...existing,
          fields: payload.fields as Record<string, Record<string, unknown>>,
          sys: { ...existing.sys, version: existing.sys.version + 1 },
        };
        createdEntries[resolvedEntryId] = updated;
        return updated;
      }),
      get: vi.fn(async ({ entryId }: { entryId: string }) => {
        const entry = createdEntries[entryId];
        if (!entry) {
          throw { status: 404, name: 'NotFound', message: 'Not found' };
        }
        return entry;
      }),
    },
  };
}

describe('EntryCopier', () => {
  it('creates entries without source links and rewrites mapped links on update', async () => {
    const childSource = getMockEntry('child-source', {
      title: { 'en-US': 'Child' },
    });
    const rootSource = getMockEntry('root-source', {
      title: { 'en-US': 'Root' },
      child: {
        'en-US': {
          sys: { type: 'Link', linkType: 'Entry', id: 'child-source' },
        },
      },
    });

    const createdEntries: Record<string, ReturnType<typeof getMockEntry>> = {};
    const client = buildEntryCopierClient(createdEntries);

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: client as unknown as SpaceContext['client'],
    };

    const copier = new EntryCopier(target, 'Copy', true, 1);
    const result = await copier.copyEntries(
      {
        'child-source': childSource,
        'root-source': rootSource,
      },
      'root-source',
      {},
      {}
    );

    expect(result.rootEntry.sys.id).toBe('root-source');
    expect(client.entry.createWithId).toHaveBeenCalledTimes(2);
    expect(client.entry.update).toHaveBeenCalled();
    expect(copier.getStrippedLinkCount()).toBe(0);
  });

  it('overwrites existing entries instead of creating duplicates', async () => {
    const childSource = getMockEntry('child-source', {
      title: { 'en-US': 'Child' },
    });
    const rootSource = getMockEntry('root-source', {
      title: { 'en-US': 'Root' },
    });

    const createdEntries: Record<string, ReturnType<typeof getMockEntry>> = {
      'child-source': {
        ...getMockEntry('child-source', { title: { 'en-US': 'Old child' } }),
        sys: { ...getMockEntry('child-source', {}).sys, id: 'child-source', version: 3 },
      },
    };
    const client = buildEntryCopierClient(createdEntries);

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: client as unknown as SpaceContext['client'],
    };

    const copier = new EntryCopier(target, 'Copy', true, 1, 'overwrite');
    await copier.copyEntries(
      {
        'child-source': childSource,
        'root-source': rootSource,
      },
      'root-source',
      {},
      {}
    );

    expect(client.entry.createWithId).toHaveBeenCalledTimes(1);
    expect(client.entry.createWithId).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'root-source' }),
      expect.any(Object)
    );
    expect(client.entry.update).toHaveBeenCalled();
    expect(copier.getSkippedEntryIds()).toEqual([]);
  });

  it('skips existing entries and leaves them unchanged', async () => {
    const childSource = getMockEntry('child-source', {
      title: { 'en-US': 'Child' },
    });
    const rootSource = getMockEntry('root-source', {
      title: { 'en-US': 'Root' },
    });

    const createdEntries: Record<string, ReturnType<typeof getMockEntry>> = {
      'child-source': {
        ...getMockEntry('child-source', { title: { 'en-US': 'Old child' } }),
        sys: { ...getMockEntry('child-source', {}).sys, id: 'child-source', version: 3 },
      },
    };
    const client = buildEntryCopierClient(createdEntries);

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: client as unknown as SpaceContext['client'],
    };

    const copier = new EntryCopier(target, 'Copy', true, 1, 'skip');
    await copier.copyEntries(
      {
        'child-source': childSource,
        'root-source': rootSource,
      },
      'root-source',
      {},
      {}
    );

    expect(client.entry.createWithId).toHaveBeenCalledTimes(1);
    expect(copier.getSkippedEntryIds()).toEqual(['child-source']);
    expect(createdEntries['child-source']?.fields.title?.['en-US']).toBe('Old child');
  });

  it('creates entries when target lookup returns app adapter not-found code', async () => {
    const childSource = getMockEntry('child-source', {
      title: { 'en-US': 'Child' },
    });

    const createdEntries: Record<string, ReturnType<typeof getMockEntry>> = {};
    const client = buildEntryCopierClient(createdEntries);
    client.entry.get = vi.fn(async () => {
      throw { code: 'a', message: 'The resource could not be found.' };
    });

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: client as unknown as SpaceContext['client'],
    };

    const copier = new EntryCopier(target, 'Copy', true, 1);
    await copier.copyEntries(
      {
        'child-source': childSource,
      },
      'child-source',
      {},
      {}
    );

    expect(client.entry.createWithId).toHaveBeenCalledTimes(1);
    expect(copier.getCopyFailureMessages()).toEqual([]);
  });
});
