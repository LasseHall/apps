import { AssetProps } from 'contentful-management';
import { SpaceContext } from './CmaClients';
import { mapWithConcurrency } from './concurrency';
import { ExistingResourceBehavior, getIfExists } from './existingResource';
import { normalizeAssetUrl } from './linkUtils';

export type AssetIdMap = Record<string, string>;

export type AssetCopyProgress = {
  completed: number;
  total: number;
};

/** Fields allowed when creating an asset from an upload. Source read API adds url/details after processing. */
export function buildAssetFileFieldForCreate(
  fileDetails: NonNullable<AssetProps['fields']['file']>[string],
  uploadId: string
): NonNullable<AssetProps['fields']['file']>[string] {
  return {
    fileName: fileDetails.fileName,
    contentType: fileDetails.contentType,
    uploadFrom: {
      sys: {
        type: 'Link',
        linkType: 'Upload',
        id: uploadId,
      },
    },
  };
}

export class AssetCopier {
  private failedAssetIds: string[] = [];
  private skippedAssetIds: string[] = [];

  constructor(
    private readonly target: SpaceContext,
    private readonly concurrency: number,
    private readonly existingResourceBehavior: ExistingResourceBehavior = 'overwrite',
    private readonly onProgress?: (progress: AssetCopyProgress) => void
  ) {}

  getFailedAssetIds(): string[] {
    return this.failedAssetIds;
  }

  getSkippedAssetIds(): string[] {
    return this.skippedAssetIds;
  }

  async copyAssets(sourceAssets: Record<string, AssetProps>): Promise<AssetIdMap> {
    const assetIds = Object.keys(sourceAssets);
    const idMap: AssetIdMap = {};
    let completed = 0;

    await mapWithConcurrency(assetIds, this.concurrency, async (sourceAssetId) => {
      const sourceAsset = sourceAssets[sourceAssetId];
      if (!sourceAsset) return;

      try {
        const targetAssetId = await this.copySingleAsset(sourceAsset);
        idMap[sourceAssetId] = targetAssetId;
      } catch (error) {
        console.warn('Error copying asset', sourceAssetId, error);
        this.failedAssetIds.push(sourceAssetId);
      } finally {
        completed += 1;
        this.onProgress?.({ completed, total: assetIds.length });
      }
    });

    if (this.failedAssetIds.length > 0) {
      throw new Error(
        `Failed to copy ${this.failedAssetIds.length} ${
          this.failedAssetIds.length === 1 ? 'asset' : 'assets'
        }. The copy operation was aborted to prevent broken asset links.`
      );
    }

    return idMap;
  }

  private async copySingleAsset(sourceAsset: AssetProps): Promise<string> {
    const assetId = sourceAsset.sys.id;
    const existing = await getIfExists(() =>
      this.target.client.asset.get({
        spaceId: this.target.spaceId,
        environmentId: this.target.environmentId,
        assetId,
      })
    );

    if (existing && this.existingResourceBehavior === 'skip') {
      this.skippedAssetIds.push(assetId);
      return assetId;
    }

    const title = sourceAsset.fields.title;
    const description = sourceAsset.fields.description;
    const fileField = await this.buildFileFieldFromSource(sourceAsset);

    const assetFields = {
      title: title ?? { 'en-US': fileDetailsFallbackTitle(sourceAsset.fields.file!) },
      ...(description ? { description } : {}),
      file: fileField,
    };

    const asset = existing
      ? await this.target.client.asset.update(
          {
            spaceId: this.target.spaceId,
            environmentId: this.target.environmentId,
            assetId,
          },
          {
            sys: { ...existing.sys, version: existing.sys.version },
            fields: assetFields,
            ...(sourceAsset.metadata ? { metadata: sourceAsset.metadata } : {}),
          }
        )
      : await this.target.client.asset.createWithId(
          {
            spaceId: this.target.spaceId,
            environmentId: this.target.environmentId,
            assetId,
          },
          {
            fields: assetFields,
            ...(sourceAsset.metadata ? { metadata: sourceAsset.metadata } : {}),
          }
        );

    const processedAsset = await this.target.client.asset.processForAllLocales(
      {
        spaceId: this.target.spaceId,
        environmentId: this.target.environmentId,
      },
      asset
    );

    return processedAsset.sys.id;
  }

  private async buildFileFieldFromSource(
    sourceAsset: AssetProps
  ): Promise<NonNullable<AssetProps['fields']['file']>> {
    const sourceFileField = sourceAsset.fields.file;

    if (!sourceFileField) {
      throw new Error(`Asset ${sourceAsset.sys.id} has no file field`);
    }

    const fileField: NonNullable<AssetProps['fields']['file']> = {};

    for (const locale of Object.keys(sourceFileField)) {
      const fileDetails = sourceFileField[locale];
      if (!fileDetails?.url) continue;

      const response = await fetch(normalizeAssetUrl(fileDetails.url));
      if (!response.ok) {
        throw new Error(`Failed to download asset file (${response.status})`);
      }

      const fileBuffer = await response.arrayBuffer();
      const upload = await this.target.client.upload.create(
        {
          spaceId: this.target.spaceId,
          environmentId: this.target.environmentId,
        },
        {
          file: fileBuffer,
        }
      );

      fileField[locale] = buildAssetFileFieldForCreate(fileDetails, upload.sys.id);
    }

    if (Object.keys(fileField).length === 0) {
      throw new Error(`Asset ${sourceAsset.sys.id} has no downloadable file URLs`);
    }

    return fileField;
  }
}

function fileDetailsFallbackTitle(
  fileField: NonNullable<AssetProps['fields']['file']>
): string {
  const firstLocale = Object.keys(fileField)[0];
  const fileDetails = firstLocale ? fileField[firstLocale] : undefined;
  return fileDetails?.fileName ?? 'Copied asset';
}
