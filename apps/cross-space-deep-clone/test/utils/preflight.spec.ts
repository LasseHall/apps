import { describe, expect, it, vi } from 'vitest';
import { runPreflight } from '../../src/utils/preflight';
import { getMockEntry } from './testUtils';
import { SpaceContext } from '../../src/utils/CmaClients';

describe('preflight', () => {
  it('fails when target space is missing a required content type', async () => {
    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: {
        contentType: {
          get: vi.fn(async () => {
            throw new Error('Not found');
          }),
        },
        locale: {
          getMany: vi.fn(async () => ({ items: [{ code: 'en-US' }] })),
        },
      } as unknown as SpaceContext['client'],
    };

    const result = await runPreflight(target, {
      entries: {
        'entry-1': getMockEntry('entry-1', { title: { 'en-US': 'Page' } }),
      },
      assets: {},
      entryChildren: {},
      assetParents: {},
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.level).toBe('error');
  });
});
