export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

/** Tombstone: remove this key / array index from effective */
export type Deleted = { __deleted: true };

export type OverrideNode = JsonValue | Deleted | { [key: string]: OverrideNode };

export type FieldEnvelope = {
  source: JsonObject;
  overrides: OverrideNode;
  effective: JsonObject;
};

export const DELETED: Deleted = { __deleted: true };

export function isDeleted(value: unknown): value is Deleted {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Deleted).__deleted === true &&
    Object.keys(value as object).length === 1
  );
}

export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isDeleted(value);
}

export function isJsonObjectRoot(value: unknown): value is JsonObject {
  return isPlainObject(value);
}

/** True when overrides is a nested object/index map (not a wholesale replace / tombstone). */
function isOverrideMap(value: OverrideNode): value is { [key: string]: OverrideNode } {
  return isPlainObject(value) && !isDeleted(value);
}

/**
 * Apply overrides onto source.
 * - Tombstones omit object keys or array elements
 * - Array-shaped / primitive overrides replace wholesale
 * - Object-shaped overrides deep-merge into objects, or into arrays by string index ("0", "1", …)
 * - Keys / indices not present in source are ignored
 */
export function applyOverrides(source: JsonValue, overrides: OverrideNode | undefined): JsonValue {
  if (overrides === undefined) {
    return source;
  }

  if (isDeleted(overrides)) {
    return source;
  }

  // Wholesale replace when override itself is an array or primitive
  if (Array.isArray(overrides) || overrides === null || typeof overrides !== 'object') {
    return overrides;
  }

  // Index-map overrides against an array
  if (Array.isArray(source)) {
    const result: JsonValue[] = [];
    for (let i = 0; i < source.length; i++) {
      const key = String(i);
      if (!(key in overrides)) {
        result.push(source[i]);
        continue;
      }

      const childOverride = overrides[key];
      if (isDeleted(childOverride)) {
        continue;
      }

      if (Array.isArray(childOverride) || childOverride === null || typeof childOverride !== 'object') {
        result.push(childOverride);
        continue;
      }

      result.push(applyOverrides(source[i], childOverride));
    }
    return result;
  }

  if (!isPlainObject(source)) {
    return source;
  }

  const result: JsonObject = {};
  for (const key of Object.keys(source)) {
    if (!(key in overrides)) {
      result[key] = source[key];
      continue;
    }

    const childOverride = overrides[key];
    if (isDeleted(childOverride)) {
      continue;
    }

    if (Array.isArray(childOverride) || childOverride === null || typeof childOverride !== 'object') {
      result[key] = childOverride;
      continue;
    }

    // Nested object or array index-map override
    result[key] = applyOverrides(source[key], childOverride);
  }

  return result;
}

/**
 * Drop override branches that no longer resolve against source.
 * Returns undefined when nothing remains.
 */
export function pruneOverrides(
  source: JsonValue,
  overrides: OverrideNode | undefined
): OverrideNode | undefined {
  if (overrides === undefined) {
    return undefined;
  }

  if (isDeleted(overrides)) {
    return DELETED;
  }

  // Wholesale value override
  if (Array.isArray(overrides) || overrides === null || typeof overrides !== 'object') {
    return overrides;
  }

  if (Array.isArray(source)) {
    const pruned: { [key: string]: OverrideNode } = {};
    let hasAny = false;

    for (const key of Object.keys(overrides)) {
      const index = Number(key);
      if (!Number.isInteger(index) || index < 0 || index >= source.length) {
        continue;
      }

      const child = pruneOverrides(source[index], overrides[key]);
      if (child !== undefined) {
        pruned[key] = child;
        hasAny = true;
      }
    }

    return hasAny ? pruned : undefined;
  }

  if (!isPlainObject(source)) {
    return undefined;
  }

  const pruned: { [key: string]: OverrideNode } = {};
  let hasAny = false;

  for (const key of Object.keys(overrides)) {
    if (!(key in source)) {
      continue;
    }

    const child = pruneOverrides(source[key], overrides[key]);
    if (child !== undefined) {
      pruned[key] = child;
      hasAny = true;
    }
  }

  return hasAny ? pruned : undefined;
}

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Get the override node at path, if any. Path segments are object keys or array indices as strings. */
export function getOverrideAtPath(
  overrides: OverrideNode | undefined,
  path: string[]
): OverrideNode | undefined {
  if (!overrides || path.length === 0) {
    return overrides;
  }

  let current: OverrideNode | undefined = overrides;
  for (const segment of path) {
    if (current === undefined || isDeleted(current) || !isOverrideMap(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function hasOverrideAtPath(overrides: OverrideNode | undefined, path: string[]): boolean {
  return getOverrideAtPath(overrides, path) !== undefined;
}

export function isTombstonedAtPath(overrides: OverrideNode | undefined, path: string[]): boolean {
  return isDeleted(getOverrideAtPath(overrides, path));
}

/**
 * Set an override (value or tombstone) at a path (object keys and/or array index segments).
 */
export function setOverrideAtPath(
  overrides: OverrideNode | undefined,
  path: string[],
  value: JsonValue | Deleted
): OverrideNode {
  if (path.length === 0) {
    return value as OverrideNode;
  }

  const root: { [key: string]: OverrideNode } =
    overrides !== undefined && isOverrideMap(overrides) ? { ...overrides } : {};

  let cursor: { [key: string]: OverrideNode } = root;

  for (let i = 0; i < path.length - 1; i++) {
    const segment = path[i];
    const existing = cursor[segment];
    const next: { [key: string]: OverrideNode } =
      existing !== undefined && isOverrideMap(existing) ? { ...existing } : {};
    cursor[segment] = next;
    cursor = next;
  }

  cursor[path[path.length - 1]] = value as OverrideNode;
  return root;
}

/** Remove the override branch at path. Returns {} or nested map; may be empty object. */
export function clearOverrideAtPath(
  overrides: OverrideNode | undefined,
  path: string[]
): OverrideNode {
  if (!overrides || path.length === 0) {
    return {};
  }

  if (!isOverrideMap(overrides)) {
    return path.length === 0 ? {} : overrides;
  }

  const clear = (
    node: { [key: string]: OverrideNode },
    remaining: string[]
  ): { [key: string]: OverrideNode } | undefined => {
    if (remaining.length === 0) {
      return undefined;
    }

    const [head, ...tail] = remaining;
    if (!(head in node)) {
      return node;
    }

    if (tail.length === 0) {
      const { [head]: _removed, ...rest } = node;
      return rest;
    }

    const child = node[head];
    if (!isOverrideMap(child)) {
      return node;
    }

    const nextChild = clear(child, tail);
    if (nextChild === undefined || Object.keys(nextChild).length === 0) {
      const { [head]: _removed, ...rest } = node;
      return rest;
    }

    return { ...node, [head]: nextChild };
  };

  return clear({ ...overrides }, path) ?? {};
}

export function buildEnvelope(
  source: JsonObject,
  overrides: OverrideNode | undefined = {}
): FieldEnvelope {
  const pruned = pruneOverrides(source, overrides) ?? {};
  const effective = applyOverrides(source, pruned) as JsonObject;
  return {
    source: cloneJson(source),
    overrides: pruned,
    effective,
  };
}

export function isFieldEnvelope(value: unknown): value is FieldEnvelope {
  if (!isPlainObject(value)) {
    return false;
  }
  return (
    'source' in value &&
    'overrides' in value &&
    'effective' in value &&
    isPlainObject(value.source) &&
    isPlainObject(value.effective)
  );
}

export function parseEnvelope(value: unknown): FieldEnvelope | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isFieldEnvelope(value)) {
    return null;
  }
  return buildEnvelope(value.source, value.overrides as OverrideNode);
}

export type ClassifiedFieldValue =
  | { kind: 'empty' }
  | { kind: 'envelope'; envelope: FieldEnvelope }
  | { kind: 'plainObject'; value: JsonObject }
  | { kind: 'unsupported' };

/**
 * Classify a raw field value for first-time adoption and normal editing.
 * Plain JSON objects (without envelope keys) are treated as legacy source data.
 */
export function classifyFieldValue(value: unknown): ClassifiedFieldValue {
  if (value === undefined || value === null) {
    return { kind: 'empty' };
  }
  if (isFieldEnvelope(value)) {
    return {
      kind: 'envelope',
      envelope: buildEnvelope(value.source, value.overrides as OverrideNode),
    };
  }
  if (isPlainObject(value)) {
    return { kind: 'plainObject', value };
  }
  return { kind: 'unsupported' };
}

/** Wrap pre-existing plain JSON as source with empty overrides. */
export function adoptPlainJsonAsEnvelope(value: JsonObject): FieldEnvelope {
  return buildEnvelope(value, {});
}

/** Flatten an envelope back to a plain JSON object (for backwards compatibility). */
export function unwrapEnvelope(
  envelope: FieldEnvelope,
  which: 'effective' | 'source' = 'effective'
): JsonObject {
  return cloneJson(which === 'effective' ? envelope.effective : envelope.source);
}

/** Get value at path within a JSON value. Supports object keys and array index segments. */
export function getValueAtPath(value: JsonValue, path: string[]): JsonValue | undefined {
  let current: JsonValue = value;
  for (const segment of path) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!isPlainObject(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

/** True when a path segment refers to an array index. */
export function isIndexSegment(segment: string): boolean {
  return /^\d+$/.test(segment);
}
