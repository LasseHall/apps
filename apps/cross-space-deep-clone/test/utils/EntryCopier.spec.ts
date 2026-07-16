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
      createWithId: vi.fn(async ({ entryId }: { entryId: string }, payload: { fields: unknown }) => {
        const entry = {
          ...getMockEntry(entryId, {}),
          sys: {
            ...getMockEntry(entryId, {}).sys,
            id: entryId,
            version: 1,
          },
          fields: payload.fields as Record<string, Record<string, unknown>>,
        };
        createdEntries[entryId] = entry;
        return entry;
      }),
      update: vi.fn(
        async (
          { entryId }: { entryId: string },
          payload: { fields: unknown; sys: { version: number } }
        ) => {
          const existing = createdEntries[entryId] ?? getMockEntry(entryId, {});
          const updated = {
            ...existing,
            fields: payload.fields as Record<string, Record<string, unknown>>,
            sys: { ...existing.sys, version: payload.sys.version + 1 },
          };
          createdEntries[entryId] = updated;
          return updated;
        }
      ),
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
  it('creates entries with selected locales only and keeps deselected links on update', async () => {
    const childSource = getMockEntry('child-source', {
      title: { 'en-US': 'Child', 'sv-SE': 'Barn' },
    });
    const rootSource = getMockEntry('root-source', {
      title: { 'en-US': 'Root', 'sv-SE': 'Rot' },
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

    const copier = new EntryCopier(target, 'Copy', true, 1, 'overwrite', ['en-US']);
    const result = await copier.copyEntries(
      {
        'root-source': rootSource,
      },
      'root-source',
      {},
      {}
    );

    expect(result.rootEntry.sys.id).toBe('root-source');
    expect(client.entry.createWithId).toHaveBeenCalledTimes(1);
    const createFields = client.entry.createWithId.mock.calls[0]?.[1].fields as {
      title: Record<string, string>;
    };
    expect(createFields.title).toEqual({ 'en-US': 'Copy Root' });
    expect(createFields.title).not.toHaveProperty('sv-SE');

    const updateFields = client.entry.update.mock.calls[0]?.[1].fields as {
      child: Record<string, { sys: { id: string } }>;
      title: Record<string, string>;
    };
    expect(updateFields.child['en-US']?.sys.id).toBe('child-source');
    expect(updateFields.title).toEqual({ 'en-US': 'Copy Root' });
  });

  it('merges selected locales into existing entries and preserves others', async () => {
    const rootSource = getMockEntry('root-source', {
      title: { 'en-US': 'Root', 'sv-SE': 'Rot' },
    });

    const createdEntries: Record<string, ReturnType<typeof getMockEntry>> = {
      'root-source': {
        ...getMockEntry('root-source', {
          title: { 'en-US': 'Old EN', 'sv-SE': 'Market SV' },
        }),
        sys: { ...getMockEntry('root-source', {}).sys, id: 'root-source', version: 3 },
      },
    };
    const client = buildEntryCopierClient(createdEntries);

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: client as unknown as SpaceContext['client'],
    };

    const copier = new EntryCopier(target, 'Copy', true, 1, 'overwrite', ['en-US']);
    await copier.copyEntries(
      {
        'root-source': rootSource,
      },
      'root-source',
      {},
      {}
    );

    expect(client.entry.createWithId).not.toHaveBeenCalled();
    const updateFields = client.entry.update.mock.calls[0]?.[1].fields as {
      title: Record<string, string>;
    };
    expect(updateFields.title).toEqual({
      'en-US': 'Copy Root',
      'sv-SE': 'Market SV',
    });
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

    const copier = new EntryCopier(target, 'Copy', true, 1, 'skip', ['en-US']);
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

  it('keeps original titles when clone text is empty', async () => {
    const rootSource = getMockEntry('root-source', {
      title: { 'en-US': 'Root' },
    });

    const createdEntries: Record<string, ReturnType<typeof getMockEntry>> = {};
    const client = buildEntryCopierClient(createdEntries);

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: client as unknown as SpaceContext['client'],
    };

    const copier = new EntryCopier(target, '  ', true, 1, 'overwrite', ['en-US']);
    await copier.copyEntries({ 'root-source': rootSource }, 'root-source', {}, {});

    const createFields = client.entry.createWithId.mock.calls[0]?.[1].fields as {
      title: Record<string, string>;
    };
    expect(createFields.title).toEqual({ 'en-US': 'Root' });
  });
});
