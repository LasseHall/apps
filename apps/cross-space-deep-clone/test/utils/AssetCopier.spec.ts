import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AssetCopier, buildAssetFileFieldForCreate } from '../../src/utils/AssetCopier';
import { getMockAsset } from './testUtils';
import { SpaceContext } from '../../src/utils/CmaClients';

describe('AssetCopier', () => {
  it('builds create payload without read-only url/details fields', () => {
    const payload = buildAssetFileFieldForCreate(
      {
        fileName: 'hero.jpg',
        contentType: 'image/jpeg',
        url: '//images.ctfassets.net/example/hero.jpg',
        details: {
          size: 7463,
          image: { width: 150, height: 150 },
        },
      },
      'upload-1'
    );

    expect(payload).toEqual({
      fileName: 'hero.jpg',
      contentType: 'image/jpeg',
      uploadFrom: {
        sys: {
          type: 'Link',
          linkType: 'Upload',
          id: 'upload-1',
        },
      },
    });
    expect(payload).not.toHaveProperty('url');
    expect(payload).not.toHaveProperty('details');
  });

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function buildTargetClient(existingAssets: Record<string, ReturnType<typeof getMockAsset>> = {}) {
    return {
      upload: {
        create: vi.fn(async () => ({ sys: { id: 'upload-1' } })),
      },
      asset: {
        get: vi.fn(async ({ assetId }: { assetId: string }) => {
          const asset = existingAssets[assetId];
          if (!asset) {
            throw { status: 404, name: 'NotFound', message: 'Not found' };
          }
          return asset;
        }),
        createWithId: vi.fn(async ({ assetId }: { assetId: string }, payload: { fields: unknown }) => ({
          ...getMockAsset(assetId, 'Hero'),
          fields: payload.fields as ReturnType<typeof getMockAsset>['fields'],
        })),
        update: vi.fn(async (_params: unknown, payload: { fields: unknown; sys: { version: number } }) => ({
          ...getMockAsset('asset-source', 'Hero'),
          fields: payload.fields as ReturnType<typeof getMockAsset>['fields'],
          sys: { ...getMockAsset('asset-source', 'Hero').sys, version: payload.sys.version + 1 },
        })),
        processForLocale: vi.fn(async (_params: unknown, asset: ReturnType<typeof getMockAsset>) => asset),
        processForAllLocales: vi.fn(async (_params: unknown, asset: ReturnType<typeof getMockAsset>) => asset),
      },
    };
  }

  it('downloads, uploads, and creates assets for selected locales only', async () => {
    const sourceAsset = getMockAsset('asset-source', 'Hero');
    sourceAsset.fields.title = {
      'en-US': 'Hero',
      'sv-SE': 'Hjalte',
    };
    sourceAsset.fields.file = {
      'en-US': sourceAsset.fields.file!['en-US']!,
      'sv-SE': {
        ...sourceAsset.fields.file!['en-US']!,
        fileName: 'hero-sv.jpg',
      },
    };

    const targetClient = buildTargetClient();
    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: targetClient as unknown as SpaceContext['client'],
    };

    const copier = new AssetCopier(target, 2, 'overwrite', ['en-US']);
    const idMap = await copier.copyAssets({ 'asset-source': sourceAsset });

    expect(idMap['asset-source']).toBe('asset-source');
    expect(targetClient.upload.create).toHaveBeenCalledOnce();
    expect(targetClient.asset.createWithId).toHaveBeenCalledOnce();
    const createPayload = targetClient.asset.createWithId.mock.calls[0]?.[1] as {
      fields: { title: Record<string, string>; file: Record<string, unknown> };
    };
    expect(createPayload.fields.title).toEqual({ 'en-US': 'Hero' });
    expect(Object.keys(createPayload.fields.file)).toEqual(['en-US']);
    expect(targetClient.asset.processForLocale).toHaveBeenCalledOnce();
  });

  it('updates existing assets for selected locales and preserves others', async () => {
    const sourceAsset = getMockAsset('asset-source', 'Hero');
    const existingAsset = getMockAsset('asset-source', 'Old hero');
    existingAsset.fields.title = {
      'en-US': 'Old hero',
      'sv-SE': 'Market title',
    };
    const targetClient = buildTargetClient({ 'asset-source': existingAsset });

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: targetClient as unknown as SpaceContext['client'],
    };

    const copier = new AssetCopier(target, 2, 'overwrite', ['en-US']);
    await copier.copyAssets({ 'asset-source': sourceAsset });

    expect(targetClient.asset.createWithId).not.toHaveBeenCalled();
    expect(targetClient.asset.update).toHaveBeenCalledOnce();
    const updatePayload = targetClient.asset.update.mock.calls[0]?.[1] as {
      fields: { title: Record<string, string> };
    };
    expect(updatePayload.fields.title['en-US']).toBe('Hero');
    expect(updatePayload.fields.title['sv-SE']).toBe('Market title');
  });

  it('skips existing assets when skip behavior is enabled', async () => {
    const sourceAsset = getMockAsset('asset-source', 'Hero');
    const existingAsset = getMockAsset('asset-source', 'Old hero');
    const targetClient = buildTargetClient({ 'asset-source': existingAsset });

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: targetClient as unknown as SpaceContext['client'],
    };

    const copier = new AssetCopier(target, 2, 'skip', ['en-US']);
    await copier.copyAssets({ 'asset-source': sourceAsset });

    expect(targetClient.asset.createWithId).not.toHaveBeenCalled();
    expect(targetClient.asset.update).not.toHaveBeenCalled();
    expect(targetClient.upload.create).not.toHaveBeenCalled();
    expect(copier.getSkippedAssetIds()).toEqual(['asset-source']);
  });
});
