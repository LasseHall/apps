export type RichTextNode = {
  nodeType: string;
  data?: Record<string, unknown>;
  content?: RichTextNode[];
  value?: string;
  marks?: unknown[];
};

export type RichTextRewriteResult = {
  rewrittenCount: number;
  unmappedEmbeds: string[];
};

const EMBEDDED_NODE_TYPES = new Set([
  'embedded-entry-block',
  'embedded-entry-inline',
  'embedded-asset-block',
  'embedded-asset-inline',
]);

export function isRichTextDocument(value: unknown): value is RichTextNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as RichTextNode).nodeType === 'document' &&
    Array.isArray((value as RichTextNode).content)
  );
}

export function isEmbeddedRichTextNode(node: RichTextNode): boolean {
  return EMBEDDED_NODE_TYPES.has(node.nodeType);
}

function rewriteEmbeddedTarget(
  target: unknown,
  entryIdMap: Record<string, string>,
  assetIdMap: Record<string, string>
): { rewritten: boolean; unmappedId?: string } {
  if (!target || typeof target !== 'object' || !('sys' in target)) {
    return { rewritten: false };
  }

  const sys = (target as { sys?: { type?: string; linkType?: string; id?: string } }).sys;
  if (!sys || sys.type !== 'Link' || !sys.id) {
    return { rewritten: false };
  }

  if (sys.linkType === 'Entry') {
    const mappedId = entryIdMap[sys.id];
    if (mappedId) {
      sys.id = mappedId;
      return { rewritten: true };
    }
    return { rewritten: false, unmappedId: sys.id };
  }

  if (sys.linkType === 'Asset') {
    const mappedId = assetIdMap[sys.id];
    if (mappedId) {
      sys.id = mappedId;
      return { rewritten: true };
    }
    return { rewritten: false, unmappedId: sys.id };
  }

  return { rewritten: false };
}

/**
 * Rewrites embedded entry/asset targets inside a rich text document.
 * Unmapped targets keep their original source IDs so embed shells remain visible.
 */
export function rewriteRichTextDocument(
  document: RichTextNode,
  entryIdMap: Record<string, string>,
  assetIdMap: Record<string, string>
): RichTextRewriteResult {
  let rewrittenCount = 0;
  const unmappedEmbeds: string[] = [];

  const visit = (node: RichTextNode): void => {
    if (isEmbeddedRichTextNode(node) && node.data?.target) {
      const result = rewriteEmbeddedTarget(node.data.target, entryIdMap, assetIdMap);
      if (result.rewritten) {
        rewrittenCount += 1;
      } else if (result.unmappedId) {
        unmappedEmbeds.push(result.unmappedId);
      }
    }

    if (Array.isArray(node.content)) {
      node.content.forEach(visit);
    }
  };

  document.content?.forEach(visit);

  return { rewrittenCount, unmappedEmbeds };
}

export function rewriteRichTextFields(
  fields: Record<string, Record<string, unknown> | undefined>,
  entryIdMap: Record<string, string>,
  assetIdMap: Record<string, string>
): RichTextRewriteResult {
  let rewrittenCount = 0;
  const unmappedEmbeds: string[] = [];

  for (const field of Object.values(fields)) {
    if (!field) continue;

    for (const locale of Object.keys(field)) {
      const value = field[locale];
      if (!isRichTextDocument(value)) continue;

      const result = rewriteRichTextDocument(value, entryIdMap, assetIdMap);
      rewrittenCount += result.rewrittenCount;
      unmappedEmbeds.push(...result.unmappedEmbeds);
    }
  }

  return { rewrittenCount, unmappedEmbeds };
}

/**
 * Removes all embedded nodes from rich text for the initial create pass.
 */
export function stripEmbedsFromRichTextDocument(document: RichTextNode): number {
  let removedCount = 0;

  const sanitizeNode = (node: RichTextNode): RichTextNode | null => {
    if (isEmbeddedRichTextNode(node)) {
      removedCount += 1;
      return null;
    }

    if (!Array.isArray(node.content)) {
      return node;
    }

    const nextContent = node.content
      .map((child) => sanitizeNode(child))
      .filter((child): child is RichTextNode => child !== null);

    return {
      ...node,
      content: nextContent,
    };
  };

  if (!Array.isArray(document.content)) {
    return removedCount;
  }

  document.content = document.content
    .map((child) => sanitizeNode(child))
    .filter((child): child is RichTextNode => child !== null);

  return removedCount;
}

export function stripEmbedsFromRichTextFields(
  fields: Record<string, Record<string, unknown> | undefined>
): number {
  let removedCount = 0;

  for (const field of Object.values(fields)) {
    if (!field) continue;

    for (const locale of Object.keys(field)) {
      const value = field[locale];
      if (!isRichTextDocument(value)) continue;
      removedCount += stripEmbedsFromRichTextDocument(value);
    }
  }

  return removedCount;
}
