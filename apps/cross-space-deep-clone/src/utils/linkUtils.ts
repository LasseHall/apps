export function isEntryLink(fieldValue: unknown): fieldValue is { sys: { type: 'Link'; linkType: 'Entry'; id: string } } {
  return (
    typeof fieldValue === 'object' &&
    fieldValue !== null &&
    'sys' in fieldValue &&
    typeof (fieldValue as { sys?: unknown }).sys === 'object' &&
    (fieldValue as { sys: { type?: string; linkType?: string; id?: string } }).sys.type === 'Link' &&
    (fieldValue as { sys: { linkType?: string } }).sys.linkType === 'Entry' &&
    typeof (fieldValue as { sys: { id?: string } }).sys.id === 'string'
  );
}

export function isAssetLink(fieldValue: unknown): fieldValue is { sys: { type: 'Link'; linkType: 'Asset'; id: string } } {
  return (
    typeof fieldValue === 'object' &&
    fieldValue !== null &&
    'sys' in fieldValue &&
    typeof (fieldValue as { sys?: unknown }).sys === 'object' &&
    (fieldValue as { sys: { type?: string; linkType?: string; id?: string } }).sys.type === 'Link' &&
    (fieldValue as { sys: { linkType?: string } }).sys.linkType === 'Asset' &&
    typeof (fieldValue as { sys: { id?: string } }).sys.id === 'string'
  );
}

export function isResourceLink(fieldValue: unknown): boolean {
  return (
    typeof fieldValue === 'object' &&
    fieldValue !== null &&
    'sys' in fieldValue &&
    typeof (fieldValue as { sys?: unknown }).sys === 'object' &&
    (fieldValue as { sys: { type?: string } }).sys.type === 'ResourceLink'
  );
}

export function isObject(fieldValue: unknown): fieldValue is Record<string, unknown> {
  return typeof fieldValue === 'object' && fieldValue !== null && !Array.isArray(fieldValue);
}

export function normalizeAssetUrl(url: string): string {
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  return url;
}

export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
