import { AssetProps, ContentTypeProps, EntryProps, isDraft, isPublished, isUpdated } from 'contentful-management';
import { SpaceContext } from './CmaClients';
import { mapWithConcurrency } from './concurrency';
import { isAssetLink, isEntryLink, isObject, isResourceLink } from './linkUtils';

export type ReferenceNodeType = 'entry' | 'asset';

export type EntryPublishStatus = 'draft' | 'changed' | 'published';

export type EntryContentTypeInfo = {
  contentTypeId: string;
  contentTypeName?: string;
};

export type CloneReferenceNode = {
  id: string;
  type: ReferenceNodeType;
  label: string;
  contentTypeId?: string;
  contentTypeName?: string;
  status?: EntryPublishStatus;
  children: CloneReferenceNode[];
};

export type ReferenceGraphData = {
  entries: Record<string, EntryProps>;
  assets: Record<string, AssetProps>;
  entryChildren: Record<string, string[]>;
  assetParents: Record<string, string[]>;
};

export function collectUniqueNodeIds(node: CloneReferenceNode): {
  entryIds: Set<string>;
  assetIds: Set<string>;
} {
  const entryIds = new Set<string>();
  const assetIds = new Set<string>();

  const visit = (current: CloneReferenceNode): void => {
    if (current.type === 'entry') {
      entryIds.add(current.id);
    } else {
      assetIds.add(current.id);
    }

    for (const child of current.children) {
      visit(child);
    }
  };

  visit(node);
  return { entryIds, assetIds };
}

export class ReferenceGraph {
  private entries: Record<string, EntryProps> = {};
  private assets: Record<string, AssetProps> = {};
  private entryChildren: Record<string, string[]> = {};
  private assetParents: Record<string, string[]> = {};
  private contentTypes: Record<string, ContentTypeProps> = {};

  constructor(
    private readonly source: SpaceContext,
    private readonly rootEntryId: string,
    private readonly onReferenceCountChange?: (count: number) => void
  ) {}

  async build(): Promise<CloneReferenceNode> {
    await this.collectReferences();
    await this.prefetchContentTypes();
    return this.buildReferenceNode(this.rootEntryId, 'entry', new Set());
  }

  getData(): ReferenceGraphData {
    return {
      entries: this.entries,
      assets: this.assets,
      entryChildren: this.entryChildren,
      assetParents: this.assetParents,
    };
  }

  getEntryContentTypes(): Record<string, EntryContentTypeInfo> {
    const result: Record<string, EntryContentTypeInfo> = {};

    for (const [entryId, entry] of Object.entries(this.entries)) {
      const contentTypeId = entry.sys.contentType.sys.id;
      const cachedContentType = this.contentTypes[contentTypeId];

      result[entryId] = {
        contentTypeId,
        ...(cachedContentType?.name ? { contentTypeName: cachedContentType.name } : {}),
      };
    }

    return result;
  }

  getReferenceCount(): number {
    return Object.keys(this.entries).length + Object.keys(this.assets).length;
  }

  filter(selectedEntryIds: string[], selectedAssetIds: string[]): ReferenceGraphData {
    const selectedEntries = new Set(selectedEntryIds);
    selectedEntries.add(this.rootEntryId);

    const selectedAssets = new Set(selectedAssetIds);

    return {
      entries: Object.fromEntries(
        Object.entries(this.entries).filter(([entryId]) => selectedEntries.has(entryId))
      ),
      assets: Object.fromEntries(
        Object.entries(this.assets).filter(([assetId]) => selectedAssets.has(assetId))
      ),
      entryChildren: this.entryChildren,
      assetParents: this.assetParents,
    };
  }

  private async collectReferences(): Promise<void> {
    try {
      await this.collectReferencesViaReferencesEndpoint();
    } catch (error) {
      console.warn('entry.references failed, falling back to recursive fetch', error);
      this.entries = {};
      this.assets = {};
      this.entryChildren = {};
      this.assetParents = {};
      await this.findEntryReferences(this.rootEntryId);
    }

    this.notifyCountChange();
  }

  private async collectReferencesViaReferencesEndpoint(): Promise<void> {
    const rootEntry = await this.source.client.entry.get({
      spaceId: this.source.spaceId,
      environmentId: this.source.environmentId,
      entryId: this.rootEntryId,
    });

    this.entries[this.rootEntryId] = rootEntry;

    const references = await this.source.client.entry.references({
      spaceId: this.source.spaceId,
      environmentId: this.source.environmentId,
      entryId: this.rootEntryId,
      include: 10,
    });

    for (const entry of references.items ?? []) {
      this.entries[entry.sys.id] = entry;
    }

    for (const entry of references.includes?.Entry ?? []) {
      this.entries[entry.sys.id] = entry;
    }

    for (const asset of references.includes?.Asset ?? []) {
      this.assets[asset.sys.id] = asset;
    }

    await this.ensureLinkedResourcesFromFields();
    this.buildRelationshipMaps();
  }

  private async ensureLinkedResourcesFromFields(): Promise<void> {
    const missingEntryIds = new Set<string>();
    const missingAssetIds = new Set<string>();

    for (const entry of Object.values(this.entries)) {
      this.collectMissingLinks(entry.fields, missingEntryIds, missingAssetIds);
    }

    await mapWithConcurrency([...missingEntryIds], 5, async (entryId) => {
      if (this.entries[entryId]) return;

      try {
        const entry = await this.source.client.entry.get({
          spaceId: this.source.spaceId,
          environmentId: this.source.environmentId,
          entryId,
        });
        this.entries[entryId] = entry;
      } catch (_error) {
        // Ignore broken links.
      }
    });

    await mapWithConcurrency([...missingAssetIds], 5, async (assetId) => {
      if (this.assets[assetId]) return;

      try {
        const asset = await this.source.client.asset.get({
          spaceId: this.source.spaceId,
          environmentId: this.source.environmentId,
          assetId,
        });
        this.assets[assetId] = asset;
      } catch (_error) {
        // Ignore broken links.
      }
    });
  }

  private collectMissingLinks(
    fieldValue: unknown,
    missingEntryIds: Set<string>,
    missingAssetIds: Set<string>
  ): void {
    if (!fieldValue) return;

    if (isEntryLink(fieldValue)) {
      if (!this.entries[fieldValue.sys.id]) {
        missingEntryIds.add(fieldValue.sys.id);
      }
      return;
    }

    if (isAssetLink(fieldValue)) {
      if (!this.assets[fieldValue.sys.id]) {
        missingAssetIds.add(fieldValue.sys.id);
      }
      return;
    }

    if (isResourceLink(fieldValue)) {
      return;
    }

    if (Array.isArray(fieldValue)) {
      for (const value of fieldValue) {
        this.collectMissingLinks(value, missingEntryIds, missingAssetIds);
      }
      return;
    }

    if (isObject(fieldValue)) {
      for (const value of Object.values(fieldValue)) {
        this.collectMissingLinks(value, missingEntryIds, missingAssetIds);
      }
    }
  }

  private buildRelationshipMaps(): void {
    this.entryChildren = {};
    this.assetParents = {};

    for (const entryId of Object.keys(this.entries)) {
      this.entryChildren[entryId] = [];
      const entry = this.entries[entryId];
      if (!entry) continue;

      for (const field of Object.values(entry.fields)) {
        if (!field) continue;

        for (const localeValue of Object.values(field)) {
          this.recordRelationships(localeValue, entryId);
        }
      }
    }
  }

  private recordRelationships(fieldValue: unknown, parentEntryId: string): void {
    if (!fieldValue) return;

    if (isEntryLink(fieldValue)) {
      if (this.entries[fieldValue.sys.id]) {
        this.addEntryChild(parentEntryId, fieldValue.sys.id);
      }
      return;
    }

    if (isAssetLink(fieldValue)) {
      if (this.assets[fieldValue.sys.id]) {
        this.addAssetParent(parentEntryId, fieldValue.sys.id);
      }
      return;
    }

    if (isResourceLink(fieldValue)) {
      return;
    }

    if (Array.isArray(fieldValue)) {
      for (const value of fieldValue) {
        this.recordRelationships(value, parentEntryId);
      }
      return;
    }

    if (isObject(fieldValue)) {
      for (const value of Object.values(fieldValue)) {
        this.recordRelationships(value, parentEntryId);
      }
    }
  }

  private async prefetchContentTypes(): Promise<void> {
    const contentTypeIds = [
      ...new Set(Object.values(this.entries).map((entry) => entry.sys.contentType.sys.id)),
    ];

    await mapWithConcurrency(contentTypeIds, 5, async (contentTypeId) => {
      await this.getContentType(contentTypeId);
    });
  }

  private async findEntryReferences(entryId: string, parentEntryId?: string): Promise<void> {
    if (parentEntryId) {
      this.addEntryChild(parentEntryId, entryId);
    }

    if (this.entries[entryId]) {
      return;
    }

    let entry: EntryProps | undefined;
    try {
      entry = await this.source.client.entry.get({
        spaceId: this.source.spaceId,
        environmentId: this.source.environmentId,
        entryId,
      });
    } catch (_error) {
      return;
    }

    this.entries[entryId] = entry;
    this.notifyCountChange();
    this.entryChildren[entryId] ||= [];

    for (const fieldName in entry.fields) {
      const field = entry.fields[fieldName];
      if (!field) continue;

      for (const locale in field) {
        const fieldValue = field[locale];
        await this.inspectField(fieldValue, entryId);
      }
    }
  }

  private async findAssetReference(assetId: string, parentEntryId: string): Promise<void> {
    this.addAssetParent(parentEntryId, assetId);

    if (this.assets[assetId]) {
      return;
    }

    let asset: AssetProps | undefined;
    try {
      asset = await this.source.client.asset.get({
        spaceId: this.source.spaceId,
        environmentId: this.source.environmentId,
        assetId,
      });
    } catch (_error) {
      return;
    }

    this.assets[assetId] = asset;
    this.notifyCountChange();
  }

  private async inspectField(fieldValue: unknown, parentEntryId: string): Promise<void> {
    if (!fieldValue) return;

    if (isEntryLink(fieldValue)) {
      await this.findEntryReferences(fieldValue.sys.id, parentEntryId);
      return;
    }

    if (isAssetLink(fieldValue)) {
      await this.findAssetReference(fieldValue.sys.id, parentEntryId);
      return;
    }

    if (isResourceLink(fieldValue)) {
      return;
    }

    if (Array.isArray(fieldValue)) {
      for (const value of fieldValue) {
        await this.inspectField(value, parentEntryId);
      }
      return;
    }

    if (isObject(fieldValue)) {
      for (const value of Object.values(fieldValue)) {
        await this.inspectField(value, parentEntryId);
      }
    }
  }

  private async buildReferenceNode(
    id: string,
    type: ReferenceNodeType,
    visitedEntryIds: Set<string>
  ): Promise<CloneReferenceNode> {
    const title =
      type === 'entry'
        ? await this.getEntryLabel(this.entries[id])
        : await this.getAssetLabel(this.assets[id]);

    const children: CloneReferenceNode[] = [];
    let contentTypeId: string | undefined;
    let contentTypeName: string | undefined;
    let status: EntryPublishStatus | undefined;
    let label = title;

    if (type === 'entry') {
      const entry = this.entries[id];
      contentTypeId = entry?.sys.contentType.sys.id;
      status = entry ? getEntryPublishStatus(entry) : undefined;
      if (contentTypeId) {
        label = `${title} · ${contentTypeId}`;
        const contentType = this.contentTypes[contentTypeId];
        contentTypeName = contentType?.name;
      }

      const nextVisited = new Set(visitedEntryIds).add(id);

      for (const childEntryId of this.entryChildren[id] || []) {
        if (nextVisited.has(childEntryId)) continue;
        children.push(await this.buildReferenceNode(childEntryId, 'entry', nextVisited));
      }

      for (const assetId of this.getAssetChildrenForEntry(id)) {
        children.push(await this.buildReferenceNode(assetId, 'asset', nextVisited));
      }
    }

    return {
      id,
      type,
      label,
      ...(contentTypeId ? { contentTypeId } : {}),
      ...(contentTypeName ? { contentTypeName } : {}),
      ...(status ? { status } : {}),
      children,
    };
  }

  private getAssetChildrenForEntry(entryId: string): string[] {
    return Object.entries(this.assetParents)
      .filter(([, parents]) => parents.includes(entryId))
      .map(([assetId]) => assetId);
  }

  private async getEntryLabel(entry?: EntryProps): Promise<string> {
    if (!entry) return 'Unknown entry';

    const contentTypeId = entry.sys.contentType.sys.id;
    const contentType = await this.getContentType(contentTypeId);
    const displayFieldId = contentType.displayField;

    if (displayFieldId && entry.fields[displayFieldId]) {
      const displayFieldValues = entry.fields[displayFieldId];
      const displayValue = Object.values(displayFieldValues).find((value) => typeof value === 'string');
      if (typeof displayValue === 'string' && displayValue.trim()) {
        return displayValue;
      }
    }

    return entry.sys.id;
  }

  private async getAssetLabel(asset?: AssetProps): Promise<string> {
    if (!asset) return 'Unknown asset';

    const titleField = asset.fields.title;
    if (titleField) {
      const title = Object.values(titleField).find((value) => typeof value === 'string');
      if (typeof title === 'string' && title.trim()) {
        return title;
      }
    }

    const fileField = asset.fields.file;
    if (fileField) {
      const fileName = Object.values(fileField)
        .map((file) => file?.fileName)
        .find((value) => typeof value === 'string');
      if (typeof fileName === 'string' && fileName.trim()) {
        return fileName;
      }
    }

    return asset.sys.id;
  }

  private async getContentType(contentTypeId: string): Promise<ContentTypeProps> {
    const cached = this.contentTypes[contentTypeId];
    if (cached) return cached;

    const contentType = await this.source.client.contentType.get({
      spaceId: this.source.spaceId,
      environmentId: this.source.environmentId,
      contentTypeId,
    });
    this.contentTypes[contentTypeId] = contentType;
    return contentType;
  }

  private addEntryChild(parentEntryId: string, childEntryId: string): void {
    if (parentEntryId === childEntryId) return;
    const children = this.entryChildren[parentEntryId] || [];
    if (!children.includes(childEntryId)) {
      children.push(childEntryId);
    }
    this.entryChildren[parentEntryId] = children;
  }

  private addAssetParent(parentEntryId: string, assetId: string): void {
    const parents = this.assetParents[assetId] || [];
    if (!parents.includes(parentEntryId)) {
      parents.push(parentEntryId);
    }
    this.assetParents[assetId] = parents;
  }

  private notifyCountChange(): void {
    this.onReferenceCountChange?.(this.getReferenceCount());
  }
}

export function getEntryPublishStatus(entry: EntryProps): EntryPublishStatus {
  if (isDraft(entry)) return 'draft';
  if (isUpdated(entry)) return 'changed';
  if (isPublished(entry)) return 'published';
  return 'draft';
}
