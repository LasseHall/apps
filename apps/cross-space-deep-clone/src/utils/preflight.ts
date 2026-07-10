import { SpaceContext } from './CmaClients';
import { ReferenceGraphData } from './ReferenceGraph';
import { formatContentTypeCheckFailure } from './cmaErrors';

export type PreflightIssue = {
  level: 'error' | 'warning';
  message: string;
};

export type PreflightResult = {
  ok: boolean;
  issues: PreflightIssue[];
};

export async function runPreflight(
  target: SpaceContext,
  graphData: ReferenceGraphData
): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];
  const contentTypeIds = new Set<string>();

  for (const entry of Object.values(graphData.entries)) {
    contentTypeIds.add(entry.sys.contentType.sys.id);
  }

  const contentTypeErrors: string[] = [];
  for (const contentTypeId of contentTypeIds) {
    try {
      await target.client.contentType.get({
        spaceId: target.spaceId,
        environmentId: target.environmentId,
        contentTypeId,
      });
    } catch (error) {
      console.error('[cross-space-deep-clone] contentType.get failed', {
        contentTypeId,
        targetSpaceId: target.spaceId,
        environmentId: target.environmentId,
        error,
      });
      contentTypeErrors.push(
        formatContentTypeCheckFailure(contentTypeId, target.spaceId, target.environmentId, error)
      );
    }
  }

  if (contentTypeErrors.length > 0) {
    issues.push({
      level: 'error',
      message: contentTypeErrors.join(' '),
    });
  }

  try {
    const targetLocales = await target.client.locale.getMany({
      spaceId: target.spaceId,
      environmentId: target.environmentId,
    });
    const targetLocaleCodes = new Set(targetLocales.items.map((locale) => locale.code));

    const sourceLocaleCodes = new Set<string>();
    for (const entry of Object.values(graphData.entries)) {
      for (const field of Object.values(entry.fields)) {
        if (!field) continue;
        for (const locale of Object.keys(field)) {
          sourceLocaleCodes.add(locale);
        }
      }
    }

    const missingLocales = [...sourceLocaleCodes].filter((locale) => !targetLocaleCodes.has(locale));
    if (missingLocales.length > 0) {
      issues.push({
        level: 'warning',
        message: `Some source locales are not configured in target space: ${missingLocales.join(', ')}. Only overlapping locales will copy cleanly.`,
      });
    }
  } catch (_error) {
    issues.push({
      level: 'warning',
      message: 'Could not compare locales between source and target spaces.',
    });
  }

  const selectedEntryIds = new Set(Object.keys(graphData.entries));
  const selectedAssetIds = new Set(Object.keys(graphData.assets));

  for (const entry of Object.values(graphData.entries)) {
    const danglingLinks = countUnselectedDependencies(entry.fields, selectedEntryIds, selectedAssetIds);
    if (danglingLinks > 0) {
      issues.push({
        level: 'warning',
        message: `Entry "${entry.sys.id}" references ${danglingLinks} deselected item(s). Those links will be removed in the target copy.`,
      });
      break;
    }
  }

  const hasErrors = issues.some((issue) => issue.level === 'error');
  return { ok: !hasErrors, issues };
}

function countUnselectedDependencies(
  fields: Record<string, Record<string, unknown> | undefined>,
  selectedEntryIds: Set<string>,
  selectedAssetIds: Set<string>
): number {
  let count = 0;

  const inspect = (fieldValue: unknown): void => {
    if (!fieldValue) return;

    if (
      typeof fieldValue === 'object' &&
      fieldValue !== null &&
      'sys' in fieldValue &&
      typeof (fieldValue as { sys?: unknown }).sys === 'object'
    ) {
      const sys = (fieldValue as { sys: { type?: string; linkType?: string; id?: string } }).sys;
      if (sys.type === 'Link' && sys.linkType === 'Entry' && sys.id && !selectedEntryIds.has(sys.id)) {
        count += 1;
        return;
      }
      if (sys.type === 'Link' && sys.linkType === 'Asset' && sys.id && !selectedAssetIds.has(sys.id)) {
        count += 1;
        return;
      }
    }

    if (Array.isArray(fieldValue)) {
      fieldValue.forEach(inspect);
      return;
    }

    if (typeof fieldValue === 'object' && fieldValue !== null) {
      Object.values(fieldValue).forEach(inspect);
    }
  };

  for (const field of Object.values(fields)) {
    if (!field) continue;
    for (const localeValue of Object.values(field)) {
      inspect(localeValue);
    }
  }

  return count;
}
