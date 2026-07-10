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
        createWithId: vi.fn(async ({ assetId }: { assetId: string }) =>
          getMockAsset(assetId, 'Hero')
        ),
        update: vi.fn(async (_params: unknown, payload: { fields: unknown; sys: { version: number } }) => ({
          ...getMockAsset('asset-source', 'Hero'),
          fields: payload.fields as ReturnType<typeof getMockAsset>['fields'],
          sys: { ...getMockAsset('asset-source', 'Hero').sys, version: payload.sys.version + 1 },
        })),
        processForAllLocales: vi.fn(async (_params: unknown, asset: ReturnType<typeof getMockAsset>) => asset),
      },
    };
  }

  it('downloads, uploads, and creates assets in the target space', async () => {
    const sourceAsset = getMockAsset('asset-source', 'Hero');
    const targetClient = buildTargetClient();

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: targetClient as unknown as SpaceContext['client'],
    };

    const copier = new AssetCopier(target, 2);
    const idMap = await copier.copyAssets({ 'asset-source': sourceAsset });

    expect(idMap['asset-source']).toBe('asset-source');
    expect(targetClient.upload.create).toHaveBeenCalledOnce();
    expect(targetClient.asset.createWithId).toHaveBeenCalledOnce();
    expect(targetClient.asset.createWithId).toHaveBeenCalledWith(
      expect.objectContaining({ assetId: 'asset-source' }),
      expect.any(Object)
    );
    const createPayload = targetClient.asset.createWithId.mock.calls[0]?.[1] as {
      fields: { file: Record<string, Record<string, unknown>> };
    };
    expect(createPayload.fields.file['en-US']).not.toHaveProperty('details');
    expect(createPayload.fields.file['en-US']).not.toHaveProperty('url');
    expect(targetClient.asset.processForAllLocales).toHaveBeenCalledOnce();
  });

  it('updates existing assets when overwrite behavior is enabled', async () => {
    const sourceAsset = getMockAsset('asset-source', 'Hero');
    const existingAsset = getMockAsset('asset-source', 'Old hero');
    const targetClient = buildTargetClient({ 'asset-source': existingAsset });

    const target: SpaceContext = {
      spaceId: 'target-space',
      environmentId: 'master',
      client: targetClient as unknown as SpaceContext['client'],
    };

    const copier = new AssetCopier(target, 2, 'overwrite');
    await copier.copyAssets({ 'asset-source': sourceAsset });

    expect(targetClient.asset.createWithId).not.toHaveBeenCalled();
    expect(targetClient.asset.update).toHaveBeenCalledOnce();
    expect(copier.getSkippedAssetIds()).toEqual([]);
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

    const copier = new AssetCopier(target, 2, 'skip');
    await copier.copyAssets({ 'asset-source': sourceAsset });

    expect(targetClient.asset.createWithId).not.toHaveBeenCalled();
    expect(targetClient.asset.update).not.toHaveBeenCalled();
    expect(targetClient.upload.create).not.toHaveBeenCalled();
    expect(copier.getSkippedAssetIds()).toEqual(['asset-source']);
  });
});
