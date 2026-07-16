import { ContentTypeProps, CreateEntryProps, EntryProps } from 'contentful-management';
import { SpaceContext } from './CmaClients';
import { formatCopyResourceError } from './cmaErrors';
import { mapWithConcurrency } from './concurrency';
import { ExistingResourceBehavior, getIfExists } from './existingResource';
import { filterFieldsToLocales, mergeLocalizedFields } from './localeUtils';
import { deepClone, isAssetLink, isEntryLink, isObject, isResourceLink } from './linkUtils';
import { AssetIdMap } from './AssetCopier';
import {
  isRichTextDocument,
  rewriteRichTextDocument,
  stripEmbedsFromRichTextFields,
} from './richTextUtils';

export type EntryIdMap = Record<string, string>;

export type EntryCopyProgress = {
  created: number;
  updated: number;
  total: number;
};

export class EntryCopier {
  private clones: Record<string, EntryProps> = {};
  private sourceEntries: Record<string, EntryProps> = {};
  private failedCloneIds: string[] = [];
  private failedUpdateIds: string[] = [];
  private copyFailureMessages: string[] = [];
  private unmappedRichTextEmbeds: string[] = [];
  private skippedEntryIds = new Set<string>();
  private contentTypes: Record<string, ContentTypeProps> = {};
  private updates = 0;

  constructor(
    private readonly target: SpaceContext,
    private readonly cloneText: string,
    private readonly cloneTextBefore: boolean,
    private readonly concurrency: number,
    private readonly existingResourceBehavior: ExistingResourceBehavior = 'overwrite',
    private readonly selectedLocales: string[] = [],
    private readonly onProgress?: (progress: EntryCopyProgress) => void
  ) {}

  getFailedUpdateIds(): string[] {
    return this.failedUpdateIds;
  }

  getUnmappedRichTextEmbeds(): string[] {
    return [...new Set(this.unmappedRichTextEmbeds)];
  }

  getSkippedEntryIds(): string[] {
    return [...this.skippedEntryIds];
  }

  getCopyFailureMessages(): string[] {
    return this.copyFailureMessages;
  }

  async copyEntries(
    sourceEntries: Record<string, EntryProps>,
    rootSourceEntryId: string,
    entryIdMapSeed: EntryIdMap,
    assetIdMap: AssetIdMap
  ): Promise<{ rootEntry: EntryProps; entryIdMap: EntryIdMap }> {
    const entryIds = Object.keys(sourceEntries);
    this.sourceEntries = sourceEntries;
    let created = 0;

    await mapWithConcurrency(entryIds, this.concurrency, async (sourceEntryId) => {
      const sourceEntry = sourceEntries[sourceEntryId];
      if (!sourceEntry) return;

      try {
        const existing = await getIfExists(() =>
          this.target.client.entry.get({
            spaceId: this.target.spaceId,
            environmentId: this.target.environmentId,
            entryId: sourceEntryId,
          })
        );

        if (existing) {
          this.clones[sourceEntryId] = existing;
          entryIdMapSeed[sourceEntryId] = sourceEntryId;

          if (this.existingResourceBehavior === 'skip') {
            this.skippedEntryIds.add(sourceEntryId);
          }

          return;
        }

        const fields = await this.getFieldsForCreate(sourceEntry);
        const localizedFields = filterFieldsToLocales(fields, this.selectedLocales);
        const strippedFields = this.stripLinksForCreate(localizedFields);

        const createProps: CreateEntryProps = {
          fields: strippedFields,
          ...(sourceEntry.metadata ? { metadata: sourceEntry.metadata } : {}),
        };

        const clone = await this.target.client.entry.createWithId(
          {
            spaceId: this.target.spaceId,
            environmentId: this.target.environmentId,
            entryId: sourceEntryId,
            contentTypeId: sourceEntry.sys.contentType.sys.id,
          },
          createProps
        );

        this.clones[sourceEntryId] = clone;
        entryIdMapSeed[sourceEntryId] = sourceEntryId;
      } catch (error) {
        const message = formatCopyResourceError('entry', sourceEntryId, 'create', error);
        console.warn('Error creating entry copy', sourceEntryId, error);
        this.copyFailureMessages.push(message);
        this.failedCloneIds.push(sourceEntryId);
      } finally {
        created += 1;
        this.onProgress?.({ created, updated: this.updates, total: entryIds.length });
      }
    });

    if (this.failedCloneIds.length > 0) {
      const details = this.copyFailureMessages.join(' ');
      throw new Error(
        `Failed to copy ${this.failedCloneIds.length} ${
          this.failedCloneIds.length === 1 ? 'entry' : 'entries'
        }. The copy operation was aborted to prevent a partially copied structure. ${details}`.trim()
      );
    }

    await this.updateReferenceTree(entryIdMapSeed, assetIdMap);

    const rootClone = this.clones[rootSourceEntryId];
    if (!rootClone) {
      throw new Error('Root entry copy was not created.');
    }

    return { rootEntry: rootClone, entryIdMap: entryIdMapSeed };
  }

  private async updateReferenceTree(entryIdMap: EntryIdMap, assetIdMap: AssetIdMap): Promise<void> {
    const cloneEntries = Object.entries(this.clones);

    await mapWithConcurrency(cloneEntries, this.concurrency, async ([sourceEntryId, clone]) => {
      if (this.skippedEntryIds.has(sourceEntryId)) {
        return;
      }

      const sourceEntry = this.sourceEntries[sourceEntryId];
      if (!sourceEntry) return;

      const sourceFields = await this.getFieldsForCreate(sourceEntry);
      this.applyMappedLinks(sourceFields, entryIdMap, assetIdMap);
      const localizedSourceFields = filterFieldsToLocales(sourceFields, this.selectedLocales);

      let latestClone = clone;
      for (let retryCount = 0; retryCount < 3; retryCount++) {
        try {
          const mergedFields = mergeLocalizedFields(
            latestClone.fields,
            localizedSourceFields,
            this.selectedLocales
          );

          const updated = await this.target.client.entry.update(
            {
              spaceId: this.target.spaceId,
              environmentId: this.target.environmentId,
              entryId: latestClone.sys.id,
            },
            {
              sys: { ...latestClone.sys, version: latestClone.sys.version },
              fields: mergedFields,
            }
          );
          this.clones[sourceEntryId] = updated;
          this.updates += 1;
          this.onProgress?.({
            created: Object.keys(this.clones).length,
            updated: this.updates,
            total: Object.keys(this.clones).length,
          });
          break;
        } catch (error: unknown) {
          const err = error as { name?: string; code?: string };
          if (err.name === 'VersionMismatch' || err.code === 'VersionMismatch') {
            latestClone = await this.target.client.entry.get({
              spaceId: this.target.spaceId,
              environmentId: this.target.environmentId,
              entryId: clone.sys.id,
            });
            continue;
          }
          console.warn('Error updating copied entry links.', error);
          this.failedUpdateIds.push(clone.sys.id);
          break;
        }
      }
    });
  }

  private applyMappedLinks(
    fields: EntryProps['fields'],
    entryIdMap: EntryIdMap,
    assetIdMap: AssetIdMap
  ): void {
    for (const field of Object.values(fields)) {
      if (!field) continue;
      for (const locale of Object.keys(field)) {
        const fieldValue = field[locale];
        if (isRichTextDocument(fieldValue)) {
          const result = rewriteRichTextDocument(fieldValue, entryIdMap, assetIdMap);
          this.unmappedRichTextEmbeds.push(...result.unmappedEmbeds);
          continue;
        }

        this.rewriteLinksOnField(fieldValue, entryIdMap, assetIdMap);
      }
    }
  }

  private rewriteLinksOnField(
    fieldValue: unknown,
    entryIdMap: EntryIdMap,
    assetIdMap: AssetIdMap
  ): boolean {
    if (!fieldValue) return false;

    if (isRichTextDocument(fieldValue)) {
      return false;
    }

    if (isEntryLink(fieldValue)) {
      const mappedId = entryIdMap[fieldValue.sys.id];
      if (mappedId) {
        fieldValue.sys.id = mappedId;
        return true;
      }
      // Keep deselected / unmapped links by source ID.
      return false;
    }

    if (isAssetLink(fieldValue)) {
      const mappedId = assetIdMap[fieldValue.sys.id];
      if (mappedId) {
        fieldValue.sys.id = mappedId;
        return true;
      }
      return false;
    }

    if (isResourceLink(fieldValue)) {
      return false;
    }

    if (Array.isArray(fieldValue)) {
      let didUpdate = false;
      for (let index = 0; index < fieldValue.length; index += 1) {
        const value = fieldValue[index];
        const clonedValue = deepClone(value);
        if (this.rewriteLinksOnField(clonedValue, entryIdMap, assetIdMap)) {
          fieldValue[index] = clonedValue;
          didUpdate = true;
        }
      }
      return didUpdate;
    }

    if (isObject(fieldValue)) {
      let didUpdate = false;
      for (const [key, value] of Object.entries(fieldValue)) {
        if (this.rewriteLinksOnField(value, entryIdMap, assetIdMap)) {
          didUpdate = true;
          continue;
        }
        // Keep unmapped links in place.
        void key;
      }
      return didUpdate;
    }

    return false;
  }

  private stripLinksForCreate(fields: EntryProps['fields']): EntryProps['fields'] {
    const clonedFields = deepClone(fields);
    this.removeAllLinks(clonedFields);
    stripEmbedsFromRichTextFields(clonedFields);
    return clonedFields;
  }

  private removeAllLinks(fieldValue: unknown): void {
    if (!fieldValue) return;

    if (isRichTextDocument(fieldValue)) {
      return;
    }

    if (isEntryLink(fieldValue) || isAssetLink(fieldValue)) {
      return;
    }

    if (Array.isArray(fieldValue)) {
      for (let index = fieldValue.length - 1; index >= 0; index -= 1) {
        const value = fieldValue[index];
        if (isEntryLink(value) || isAssetLink(value)) {
          fieldValue.splice(index, 1);
          continue;
        }
        this.removeAllLinks(value);
      }
      return;
    }

    if (isObject(fieldValue)) {
      for (const [key, value] of Object.entries(fieldValue)) {
        if (isEntryLink(value) || isAssetLink(value)) {
          delete fieldValue[key];
          continue;
        }
        this.removeAllLinks(value);
      }
    }
  }

  private async getFieldsForCreate(entry: EntryProps): Promise<EntryProps['fields']> {
    const entryFields = deepClone(entry.fields);
    const contentTypeId = entry.sys.contentType.sys.id;
    const contentType = await this.getContentType(contentTypeId);
    const titleField = contentType.fields.find((field) => field.id === contentType.displayField);
    const selected = new Set(this.selectedLocales);

    if (titleField && entryFields[titleField.id]) {
      const titleFieldValues = entryFields[titleField.id];
      const cloneText = this.cloneText.trim();
      if (cloneText) {
        for (const locale in titleFieldValues) {
          if (selected.size > 0 && !selected.has(locale)) continue;
          const title = titleFieldValues[locale];
          if (typeof title !== 'string') continue;
          titleFieldValues[locale] = this.cloneTextBefore
            ? `${cloneText} ${title}`
            : `${title} ${cloneText}`;
        }
      }
    }

    return entryFields;
  }

  private async getContentType(contentTypeId: string): Promise<ContentTypeProps> {
    const cached = this.contentTypes[contentTypeId];
    if (cached) return cached;

    const contentType = await this.target.client.contentType.get({
      spaceId: this.target.spaceId,
      environmentId: this.target.environmentId,
      contentTypeId,
    });
    this.contentTypes[contentTypeId] = contentType;
    return contentType;
  }
}
