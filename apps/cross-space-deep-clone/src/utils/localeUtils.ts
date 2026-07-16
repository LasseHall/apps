import { KeyValueMap } from 'contentful-management';
import { AppParameters, LocaleOption } from '@/vite-env';
import { SpaceContext } from './CmaClients';
import { deepClone } from './linkUtils';

export type LocalizedFields = Record<string, Record<string, unknown> | undefined>;

export async function getSourceLocales(source: SpaceContext): Promise<LocaleOption[]> {
  const response = await source.client.locale.getMany({
    spaceId: source.spaceId,
    environmentId: source.environmentId,
  });

  return response.items
    .map((locale) => ({
      code: locale.code,
      name: locale.name,
      default: Boolean(locale.default),
    }))
    .sort((a, b) => {
      if (a.default === b.default) return a.code.localeCompare(b.code);
      return a.default ? -1 : 1;
    });
}

export function resolveDefaultSelectedLocales(
  parameters: AppParameters,
  sourceLocales: LocaleOption[]
): string[] {
  const mode = parameters.localeCopyMode ?? 'defaultOnly';

  if (mode === 'all') {
    return sourceLocales.map((locale) => locale.code);
  }

  if (mode === 'custom') {
    const custom = parameters.customLocales ?? [];
    const available = new Set(sourceLocales.map((locale) => locale.code));
    const selected = custom.filter((code) => available.has(code));
    if (selected.length > 0) return selected;
  }

  const defaultLocale = sourceLocales.find((locale) => locale.default);
  if (defaultLocale) return [defaultLocale.code];
  if (sourceLocales[0]) return [sourceLocales[0].code];
  return [];
}

export function filterFieldsToLocales(
  fields: LocalizedFields,
  selectedLocales: string[]
): LocalizedFields {
  const selected = new Set(selectedLocales);
  const nextFields: LocalizedFields = {};

  for (const [fieldId, field] of Object.entries(fields)) {
    if (!field) continue;

    const nextField: Record<string, unknown> = {};
    for (const locale of Object.keys(field)) {
      if (!selected.has(locale)) continue;
      nextField[locale] = field[locale];
    }

    if (Object.keys(nextField).length > 0) {
      nextFields[fieldId] = nextField;
    }
  }

  return nextFields;
}

export function mergeLocalizedFields(
  targetFields: LocalizedFields | KeyValueMap | undefined,
  sourceFields: LocalizedFields,
  selectedLocales: string[]
): LocalizedFields {
  const selected = new Set(selectedLocales);
  const merged: LocalizedFields = deepClone((targetFields ?? {}) as LocalizedFields);

  for (const [fieldId, sourceField] of Object.entries(sourceFields)) {
    if (!sourceField) continue;

    const nextField: Record<string, unknown> = {
      ...(merged[fieldId] ?? {}),
    };

    for (const locale of Object.keys(sourceField)) {
      if (!selected.has(locale)) continue;
      nextField[locale] = sourceField[locale];
    }

    if (Object.keys(nextField).length > 0) {
      merged[fieldId] = nextField;
    }
  }

  return merged;
}

export function filterLocalizedMap<T>(
  values: Record<string, T> | undefined,
  selectedLocales: string[]
): Record<string, T> | undefined {
  if (!values) return undefined;

  const selected = new Set(selectedLocales);
  const next: Record<string, T> = {};

  for (const [locale, value] of Object.entries(values)) {
    if (!selected.has(locale)) continue;
    next[locale] = value;
  }

  return Object.keys(next).length > 0 ? next : undefined;
}
