import { DialogAppSDK } from '@contentful/app-sdk';
import { CloneReferenceNode, EntryContentTypeInfo } from './ReferenceGraph';
import { createPlainClient } from './CmaClients';

export function collectEntryIdsFromTree(node: CloneReferenceNode): string[] {
  const entryIds = node.type === 'entry' ? [node.id] : [];

  for (const child of node.children) {
    entryIds.push(...collectEntryIdsFromTree(child));
  }

  return entryIds;
}

export function parseContentTypeFromLabel(label: string): {
  title: string;
  contentTypeId?: string;
} {
  const separatorIndex = label.lastIndexOf(' · ');
  if (separatorIndex === -1) {
    return { title: label };
  }

  return {
    title: label.slice(0, separatorIndex),
    contentTypeId: label.slice(separatorIndex + 3),
  };
}

export function formatContentTypeLabel(
  node: CloneReferenceNode,
  entryContentTypes: Record<string, EntryContentTypeInfo>
): string {
  if (node.type !== 'entry') {
    return '—';
  }

  const lookup = entryContentTypes[node.id];
  const parsedLabel = parseContentTypeFromLabel(node.label);
  const contentTypeId = node.contentTypeId ?? lookup?.contentTypeId ?? parsedLabel.contentTypeId;
  const contentTypeName = node.contentTypeName ?? lookup?.contentTypeName;

  if (contentTypeName && contentTypeId) {
    return `${contentTypeName} (${contentTypeId})`;
  }

  return contentTypeName ?? contentTypeId ?? '—';
}

export function formatNodeMeta(
  node: CloneReferenceNode,
  isRoot: boolean,
  entryContentTypes: Record<string, EntryContentTypeInfo>
): string {
  if (node.type === 'asset') {
    return `Asset · ${node.id}`;
  }

  const contentType = formatContentTypeLabel(node, entryContentTypes);

  if (isRoot) {
    return contentType !== '—' ? `Root entry · ${contentType}` : `Root entry · ${node.id}`;
  }

  return contentType !== '—' ? `${contentType} · ${node.id}` : node.id;
}

export async function fetchEntryContentTypes(
  sdk: DialogAppSDK,
  entryIds: string[]
): Promise<Record<string, EntryContentTypeInfo>> {
  const client = createPlainClient(sdk);
  const environmentId = sdk.ids.environmentAlias ?? sdk.ids.environment;
  const uniqueEntryIds = [...new Set(entryIds)];
  const result: Record<string, EntryContentTypeInfo> = {};

  await Promise.all(
    uniqueEntryIds.map(async (entryId) => {
      try {
        const entry = await client.entry.get({
          spaceId: sdk.ids.space,
          environmentId,
          entryId,
        });
        const contentTypeId = entry.sys.contentType.sys.id;
        const info: EntryContentTypeInfo = { contentTypeId };

        try {
          const contentType = await client.contentType.get({
            spaceId: sdk.ids.space,
            environmentId,
            contentTypeId,
          });
          if (contentType.name) {
            info.contentTypeName = contentType.name;
          }
        } catch (error) {
          console.warn('Could not resolve content type name in dialog', contentTypeId, error);
        }

        result[entryId] = info;
      } catch (error) {
        console.warn('Could not load entry content type in dialog', entryId, error);
      }
    })
  );

  return result;
}
