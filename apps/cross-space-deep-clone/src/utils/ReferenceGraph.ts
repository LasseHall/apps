import { AssetProps, ContentTypeProps, EntryProps } from 'contentful-management';
import { SpaceContext } from './CmaClients';
import { isAssetLink, isEntryLink, isObject, isResourceLink } from './linkUtils';

export type ReferenceNodeType = 'entry' | 'asset';

export type CloneReferenceNode = {
  id: string;
  type: ReferenceNodeType;
  label: string;
  children: CloneReferenceNode[];
};

export type ReferenceGraphData = {
  entries: Record<string, EntryProps>;
  assets: Record<string, AssetProps>;
  entryChildren: Record<string, string[]>;
  assetParents: Record<string, string[]>;
};

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
    await this.findEntryReferences(this.rootEntryId);
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
    const label =
      type === 'entry'
        ? await this.getEntryLabel(this.entries[id])
        : await this.getAssetLabel(this.assets[id]);

    const children: CloneReferenceNode[] = [];

    if (type === 'entry') {
      const nextVisited = new Set(visitedEntryIds).add(id);

      for (const childEntryId of this.entryChildren[id] || []) {
        if (nextVisited.has(childEntryId)) continue;
        children.push(await this.buildReferenceNode(childEntryId, 'entry', nextVisited));
      }

      for (const assetId of this.getAssetChildrenForEntry(id)) {
        children.push(await this.buildReferenceNode(assetId, 'asset', nextVisited));
      }
    }

    return { id, type, label, children };
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
